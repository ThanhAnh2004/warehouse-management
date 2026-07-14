import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ReportingServiceService {
  constructor(
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
    @Inject('TRANSACTION_SERVICE') private readonly transactionClient: ClientProxy,
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
    const totalInventoryValue = products.reduce((acc, p) => acc + (p.price || 0), 0); // Simplified value

    // 2. Fetch all transactions
    let transactionsData;
    try {
      transactionsData = await firstValueFrom(this.transactionClient.send('transaction.findAll', {}));
    } catch (e) {
      transactionsData = [];
    }

    const transactions = Array.isArray(transactionsData) ? transactionsData : [];
    const totalImports = transactions.filter(t => t.type === 'INBOUND').reduce((acc, t) => acc + t.quantity, 0);
    const totalExports = transactions.filter(t => t.type === 'OUTBOUND').reduce((acc, t) => acc + t.quantity, 0);

    return {
      totalProducts,
      totalInventoryValue,
      totalImports,
      totalExports,
      reportDate: new Date().toISOString()
    };
  }

  async getAnalyticsReport() {
    let inventoryData;
    try {
      inventoryData = await firstValueFrom(this.inventoryClient.send('product.find_all', { page: 1, limit: 1000 }));
    } catch (e) {
      inventoryData = { data: [] };
    }
    const products = inventoryData.data || [];

    // 1. Inventory status per product - reuses Inventory Service's EOQ-based reorder logic
    // (the same calculation that drives low-stock alerts) so this table stays consistent
    // with what actually triggers a Notification/Alert.
    const inventoryStatus = await Promise.all(
      products.map(async (p) => {
        try {
          const info = await firstValueFrom(this.inventoryClient.send('inventory.get_reorder_info', p.id));
          return {
            productId: p.id,
            sku: p.sku,
            name: p.name,
            currentStock: info.currentStock,
            eoq: info.eoq,
            lowStock: info.lowStock,
          };
        } catch (e) {
          return { productId: p.id, sku: p.sku, name: p.name, currentStock: 0, eoq: null, lowStock: false };
        }
      }),
    );

    // 2. Aggregate demand forecast across all products (best-effort; forecasting-service may be offline)
    const demandByDate: Record<string, number> = {};
    let forecastAvailable = false;
    await Promise.all(
      products.map(async (p) => {
        try {
          const res = await fetch(`http://localhost:8004/forecast/${p.id}?days=7`);
          if (!res.ok) return;
          const data = await res.json();
          for (const point of data.forecast || []) {
            demandByDate[point.date] = (demandByDate[point.date] || 0) + (point.predictedQuantity || 0);
            forecastAvailable = true;
          }
        } catch (e) {
          // Forecasting service unreachable or product has insufficient history; skip silently.
        }
      }),
    );

    const demandForecast = Object.entries(demandByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, predictedQuantity]) => ({ date, predictedQuantity: Math.round(predictedQuantity * 100) / 100 }));

    return {
      inventoryStatus,
      lowStockCount: inventoryStatus.filter((i) => i.lowStock).length,
      demandForecast,
      forecastAvailable,
      reportDate: new Date().toISOString(),
    };
  }
}
