import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Product } from '../products/entities/product.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Inventory } from '../stock/entities/inventory.entity';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly configService: ConfigService,
  ) {}

  private async getStockMap(): Promise<Record<string, number>> {
    const stockMap: Record<string, number> = {};
    try {
      const inventories = await this.inventoryRepository.find();
      for (const item of inventories) {
        stockMap[item.productId] =
          (stockMap[item.productId] || 0) + (item.currentQuantity || 0);
      }
    } catch (e) {
      this.logger.error('Lỗi khi tính toán bảng số lượng tồn kho:', e);
    }
    return stockMap;
  }

  async getSummaryReport() {
    let products: Product[] = [];
    try {
      products = await this.productRepository.find();
    } catch (e) {
      this.logger.error('Lỗi khi lấy danh sách sản phẩm cho summary report:', e);
    }

    const stockMap = await this.getStockMap();
    const totalProducts = products.length;

    const totalInventoryValue = products.reduce((acc, p) => {
      const price = parseFloat(p.price as any) || 0;
      const qty = stockMap[p.id] || 0;
      return acc + price * qty;
    }, 0);

    const totalStockQuantity = products.reduce((acc, p) => {
      const qty = stockMap[p.id] || 0;
      return acc + qty;
    }, 0);

    const lowStockItems = products
      .filter((p) => (stockMap[p.id] || 0) < (p.minStockLevel ?? 20))
      .map((p) => ({
        ...p,
        quantity: stockMap[p.id] || 0,
      }));
    const lowStock = lowStockItems.length;

    let transactions: Transaction[] = [];
    try {
      transactions = await this.transactionRepository.find({
        order: { createdAt: 'DESC' },
        take: 100000,
      });
    } catch (e) {
      this.logger.error('Lỗi khi lấy danh sách giao dịch cho summary report:', e);
    }

    const totalImports = transactions
      .filter((t) => t.type === 'INBOUND')
      .reduce((acc, t) => acc + Math.abs(t.quantity), 0);
    const totalExports = transactions
      .filter((t) => t.type === 'OUTBOUND')
      .reduce((acc, t) => acc + Math.abs(t.quantity), 0);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthlyTransactionsCount = transactions.filter((t) => {
      if (!t.createdAt) return false;
      const d = new Date(t.createdAt);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;

    return {
      totalProducts,
      totalInventoryValue,
      totalStockQuantity,
      totalImports,
      totalExports,
      totalTransactions: transactions.length,
      monthlyTransactionsCount,
      lowStock,
      lowStockItems,
      reportDate: new Date().toISOString(),
    };
  }

  async getAnalytics(params: { trendDays?: number } = {}) {
    const trendDays = params.trendDays ?? 14;

    let products: Product[] = [];
    try {
      products = await this.productRepository.find();
    } catch (e) {
      this.logger.warn('Không lấy được danh sách sản phẩm cho analytics');
    }

    const stockMap = await this.getStockMap();

    let transactions: Transaction[] = [];
    try {
      transactions = await this.transactionRepository.find({
        order: { createdAt: 'DESC' },
        take: 100000,
      });
    } catch (e) {
      this.logger.warn('Không lấy được danh sách giao dịch cho analytics');
    }

    // 1. Phân bố trạng thái tồn kho: healthy / low / over
    const stockStatus = { healthy: 0, low: 0, over: 0 };
    for (const p of products) {
      const qty = stockMap[p.id] || 0;
      const min = p.minStockLevel ?? 20;
      const max = (p as any).maxStockLevel;
      if (qty < min) stockStatus.low += 1;
      else if (max != null && qty > max) stockStatus.over += 1;
      else stockStatus.healthy += 1;
    }

    // 2. Cơ cấu theo danh mục
    const categoryMap: Record<
      string,
      { category: string; count: number; totalValue: number; totalQty: number }
    > = {};
    for (const p of products) {
      const category = p.category || 'Uncategorized';
      const price = parseFloat(p.price as any) || 0;
      const qty = stockMap[p.id] || 0;
      if (!categoryMap[category]) {
        categoryMap[category] = { category, count: 0, totalValue: 0, totalQty: 0 };
      }
      categoryMap[category].count += 1;
      categoryMap[category].totalValue += price * qty;
      categoryMap[category].totalQty += qty;
    }
    const categoryBreakdown = Object.values(categoryMap).sort(
      (a, b) => b.totalValue - a.totalValue,
    );

    // 3. Top sản phẩm theo giá trị tồn kho
    const topProductsByValue = products
      .map((p) => {
        const qty = stockMap[p.id] || 0;
        return {
          name: p.name,
          sku: p.sku,
          quantity: qty,
          value: (parseFloat(p.price as any) || 0) * qty,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // 4. Xu hướng nhập/xuất theo ngày trong trendDays gần nhất
    const dayKey = (d: any) => new Date(d).toISOString().slice(0, 10);
    const trendMap: Record<
      string,
      { date: string; inbound: number; outbound: number }
    > = {};
    const today = new Date();
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      trendMap[key] = { date: key, inbound: 0, outbound: 0 };
    }
    for (const t of transactions) {
      const key = dayKey(t.createdAt);
      if (trendMap[key]) {
        if (t.type === 'INBOUND') trendMap[key].inbound += Math.abs(t.quantity);
        else if (t.type === 'OUTBOUND') trendMap[key].outbound += Math.abs(t.quantity);
      }
    }
    const transactionTrend = Object.values(trendMap);

    return {
      generatedAt: new Date().toISOString(),
      trendDays,
      stockStatus,
      categoryBreakdown,
      topProductsByValue,
      transactionTrend,
    };
  }

  async getForecastTrends(params: { topN?: number; days?: number } = {}) {
    const topN = params.topN ?? 5;
    const days = params.days ?? 7;

    let products: Product[] = [];
    try {
      products = await this.productRepository.find();
    } catch (e) {
      this.logger.warn('Không lấy được danh sách sản phẩm cho forecast trends');
    }

    const stockMap = await this.getStockMap();

    let transactions: Transaction[] = [];
    try {
      transactions = await this.transactionRepository.find({
        where: { type: 'OUTBOUND' as any },
      });
    } catch (e) {
      this.logger.warn('Không lấy được danh sách giao dịch cho forecast trends');
    }

    // Tổng lượng xuất kho theo từng sản phẩm
    const outboundByProduct: Record<string, number> = {};
    for (const t of transactions) {
      outboundByProduct[t.productId] =
        (outboundByProduct[t.productId] || 0) + Math.abs(t.quantity);
    }

    // Xếp hạng & chọn top N sản phẩm có phát sinh xuất kho
    const ranked = products
      .map((p) => ({
        ...p,
        quantity: stockMap[p.id] || 0,
        outboundTotal: outboundByProduct[p.id] || 0,
      }))
      .filter((p) => p.outboundTotal > 0)
      .sort((a, b) => b.outboundTotal - a.outboundTotal)
      .slice(0, topN);

    const perProduct: any[] = [];
    const dailyAgg: Record<string, number> = {};

    for (const p of ranked) {
      const forecast = await this.fetchForecast(p.id, days);
      const totalForecast = forecast.reduce(
        (acc, f) => acc + (f.predictedQuantity || 0),
        0,
      );

      perProduct.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        currentStock: p.quantity,
        outboundTotal: p.outboundTotal,
        totalForecast: Math.round(totalForecast * 100) / 100,
        avgDailyForecast: Math.round((totalForecast / days) * 100) / 100,
        forecast,
      });

      for (const f of forecast) {
        dailyAgg[f.date] = (dailyAgg[f.date] || 0) + (f.predictedQuantity || 0);
      }
    }

    const aggregatedTrend = Object.keys(dailyAgg)
      .sort()
      .map((date) => ({
        date,
        predictedQuantity: Math.round(dailyAgg[date] * 100) / 100,
      }));

    return {
      generatedAt: new Date().toISOString(),
      days,
      topN,
      totalProductsAnalyzed: perProduct.length,
      products: perProduct,
      aggregatedTrend,
    };
  }

  private async fetchForecast(
    productId: string,
    days: number,
  ): Promise<Array<{ date: string; predictedQuantity: number }>> {
    const host = this.configService.get<string>(
      'FORECASTING_SERVICE_HOST',
      'localhost',
    );
    const port = this.configService.get<number>(
      'FORECASTING_SERVICE_PORT',
      8004,
    );
    try {
      const res = await fetch(
        `http://${host}:${port}/forecast/${productId}?days=${days}`,
      );
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return Array.isArray(data.forecast) ? data.forecast : [];
    } catch (e: any) {
      this.logger.warn(
        `Không lấy được dự báo cho sản phẩm ${productId}: ${e?.message || e}`,
      );
      return [];
    }
  }
}
