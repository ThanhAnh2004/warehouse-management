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
    const totalInventoryValue = products.reduce((acc, p) => {
      const price = parseFloat(p.price as any) || 0;
      const qty = parseInt(p.quantity as any, 10) || 0;
      return acc + (price * qty);
    }, 0);
    const lowStock = products.filter(p => (p.quantity || 0) < 20).length;

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
}
