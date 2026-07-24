import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ReportingServiceService {
  private readonly logger = new Logger(ReportingServiceService.name);

  constructor(
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
    @Inject('TRANSACTION_SERVICE') private readonly transactionClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  async getSummaryReport() {
    // 1. Fetch total products and total stock value
    let inventoryData;
    try {
      inventoryData = await firstValueFrom(this.inventoryClient.send('product.find_all', { page: 1, limit: 1000 }));
    } catch (e) {
      inventoryData = { data: [] };
    }

    const products = inventoryData.data || [];
    const totalProducts = products.length;
    const totalInventoryValue = products.reduce((acc, p) => {
      const price = parseFloat(p.price as any) || 0;
      const qty = parseInt(p.quantity as any, 10) || 0;
      return acc + (price * qty);
    }, 0);
    const lowStock = products.filter(p => (p.quantity || 0) < (p.minStockLevel ?? 20)).length;

    // 2. Fetch all transactions
    let transactionsData;
    try {
      transactionsData = await firstValueFrom(this.transactionClient.send('transaction.findAll', { limit: 100000 }));
    } catch (e) {
      transactionsData = [];
    }

    const transactions = Array.isArray(transactionsData)
      ? transactionsData
      : (transactionsData && Array.isArray(transactionsData.data) ? transactionsData.data : []);
    const totalImports = transactions.filter(t => t.type === 'INBOUND').reduce((acc, t) => acc + t.quantity, 0);
    const totalExports = transactions.filter(t => t.type === 'OUTBOUND').reduce((acc, t) => acc + t.quantity, 0);

    return {
      totalProducts,
      totalInventoryValue,
      totalImports,
      totalExports,
      lowStock,
      reportDate: new Date().toISOString()
    };
  }

  /**
   * Báo cáo phân tích tình hình tồn kho (đề tài: "báo cáo thống kê... tình hình tồn kho").
   * Tổng hợp: phân bố trạng thái tồn kho, cơ cấu theo danh mục, top sản phẩm giá trị cao,
   * và xu hướng nhập/xuất theo thời gian.
   */
  async getAnalytics(params: { trendDays?: number } = {}) {
    const trendDays = params.trendDays ?? 14;

    let products: any[] = [];
    try {
      const inv = await firstValueFrom(this.inventoryClient.send('product.find_all', { page: 1, limit: 1000 }));
      products = inv.data || [];
    } catch (e) {
      this.logger.warn('Không lấy được danh sách sản phẩm cho analytics');
    }

    let transactionsData;
    try {
      transactionsData = await firstValueFrom(this.transactionClient.send('transaction.findAll', { limit: 100000 }));
    } catch (e) {
      transactionsData = [];
    }
    const transactions = Array.isArray(transactionsData)
      ? transactionsData
      : (transactionsData && Array.isArray(transactionsData.data) ? transactionsData.data : []);

    // 1. Phân bố trạng thái tồn kho: healthy / low / over
    const stockStatus = { healthy: 0, low: 0, over: 0 };
    for (const p of products) {
      const qty = parseInt(p.quantity as any, 10) || 0;
      const min = p.minStockLevel ?? 20;
      const max = p.maxStockLevel;
      if (qty < min) stockStatus.low += 1;
      else if (max != null && qty > max) stockStatus.over += 1;
      else stockStatus.healthy += 1;
    }

    // 2. Cơ cấu theo danh mục
    const categoryMap: Record<string, { category: string; count: number; totalValue: number; totalQty: number }> = {};
    for (const p of products) {
      const category = p.category || 'Uncategorized';
      const price = parseFloat(p.price as any) || 0;
      const qty = parseInt(p.quantity as any, 10) || 0;
      if (!categoryMap[category]) {
        categoryMap[category] = { category, count: 0, totalValue: 0, totalQty: 0 };
      }
      categoryMap[category].count += 1;
      categoryMap[category].totalValue += price * qty;
      categoryMap[category].totalQty += qty;
    }
    const categoryBreakdown = Object.values(categoryMap).sort((a, b) => b.totalValue - a.totalValue);

    // 3. Top sản phẩm theo giá trị tồn kho
    const topProductsByValue = products
      .map(p => ({
        name: p.name,
        sku: p.sku,
        quantity: parseInt(p.quantity as any, 10) || 0,
        value: (parseFloat(p.price as any) || 0) * (parseInt(p.quantity as any, 10) || 0),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // 4. Xu hướng nhập/xuất theo ngày trong trendDays gần nhất
    const dayKey = (d: any) => new Date(d).toISOString().slice(0, 10);
    const trendMap: Record<string, { date: string; inbound: number; outbound: number }> = {};
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
        if (t.type === 'INBOUND') trendMap[key].inbound += t.quantity;
        else if (t.type === 'OUTBOUND') trendMap[key].outbound += t.quantity;
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

  /**
   * Báo cáo xu hướng nhu cầu dựa trên số liệu dự báo (đề tài: "hiển thị biểu đồ dự báo và
   * xu hướng thị trường dựa trên số liệu dự báo").
   *
   * Logic:
   *  1. Lấy danh mục sản phẩm (Inventory) + toàn bộ giao dịch (Transaction).
   *  2. Xếp hạng sản phẩm theo tổng lượng xuất kho (OUTBOUND) - đây là các mặt hàng
   *     bán chạy / biến động nhất, đáng để dự báo nhất.
   *  3. Với top N sản phẩm, gọi Forecasting Service để lấy dự báo nhu cầu N ngày tới.
   *  4. Tổng hợp thành: chi tiết theo từng sản phẩm + đường xu hướng tổng hợp theo ngày.
   */
  async getForecastTrends(params: { topN?: number; days?: number } = {}) {
    const topN = params.topN ?? 5;
    const days = params.days ?? 7;

    let products: any[] = [];
    try {
      const inv = await firstValueFrom(this.inventoryClient.send('product.find_all', { page: 1, limit: 1000 }));
      products = inv.data || [];
    } catch (e) {
      this.logger.warn('Không lấy được danh sách sản phẩm cho forecast trends');
    }

    let transactionsData;
    try {
      transactionsData = await firstValueFrom(this.transactionClient.send('transaction.findAll', { limit: 100000 }));
    } catch (e) {
      transactionsData = [];
    }
    const transactions = Array.isArray(transactionsData)
      ? transactionsData
      : (transactionsData && Array.isArray(transactionsData.data) ? transactionsData.data : []);

    // Tổng lượng xuất kho theo từng sản phẩm
    const outboundByProduct: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === 'OUTBOUND') {
        outboundByProduct[t.productId] = (outboundByProduct[t.productId] || 0) + t.quantity;
      }
    }

    // Xếp hạng & chọn top N sản phẩm có phát sinh xuất kho
    const ranked = products
      .map(p => ({ ...p, outboundTotal: outboundByProduct[p.id] || 0 }))
      .filter(p => p.outboundTotal > 0)
      .sort((a, b) => b.outboundTotal - a.outboundTotal)
      .slice(0, topN);

    const perProduct: any[] = [];
    const dailyAgg: Record<string, number> = {};

    for (const p of ranked) {
      const forecast = await this.fetchForecast(p.id, days);
      const totalForecast = forecast.reduce((acc, f) => acc + (f.predictedQuantity || 0), 0);

      perProduct.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        currentStock: p.quantity ?? 0,
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
      .map(date => ({ date, predictedQuantity: Math.round(dailyAgg[date] * 100) / 100 }));

    return {
      generatedAt: new Date().toISOString(),
      days,
      topN,
      totalProductsAnalyzed: perProduct.length,
      products: perProduct,
      aggregatedTrend,
    };
  }

  /**
   * Gọi Forecasting Service (HTTP) để lấy dự báo cho 1 sản phẩm.
   * Trả về mảng rỗng nếu service lỗi hoặc không đủ dữ liệu để dự báo.
   */
  private async fetchForecast(productId: string, days: number): Promise<Array<{ date: string; predictedQuantity: number }>> {
    const host = this.configService.get<string>('FORECASTING_SERVICE_HOST', 'localhost');
    const port = this.configService.get<number>('FORECASTING_SERVICE_PORT', 8004);
    try {
      const res = await fetch(`http://${host}:${port}/forecast/${productId}?days=${days}`);
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return Array.isArray(data.forecast) ? data.forecast : [];
    } catch (e) {
      this.logger.warn(`Không lấy được dự báo cho sản phẩm ${productId}: ${e.message}`);
      return [];
    }
  }
}
