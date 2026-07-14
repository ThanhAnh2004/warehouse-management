import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { Product } from '../products/entities/product.entity';
import { UpdateStockDto } from './dto/update-stock.dto';
import { RpcException, ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

// Fallback assumptions used when a product hasn't been given its own EOQ inputs,
// or when there isn't enough transaction history yet to estimate demand.
const DEFAULT_ORDERING_COST = 50000; // S: VND per purchase order
const DEFAULT_HOLDING_COST_RATE = 0.2; // H rate: 20%/year of unit price
const DEFAULT_ANNUAL_DEMAND = 260; // used only when there's no OUTBOUND history at all

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    @Inject('TRANSACTION_SERVICE') private readonly transactionClient: ClientProxy,
  ) {}

  async getStock(productId: string): Promise<Inventory[]> {
    return this.inventoryRepository.find({ where: { productId } });
  }

  async updateStock(updateStockDto: UpdateStockDto): Promise<Inventory> {
    const { productId, quantityChange, location = 'DEFAULT_WAREHOUSE' } = updateStockDto;

    // Find existing record
    let inventory = await this.inventoryRepository.findOne({
      where: { productId, location }
    });

    if (!inventory) {
      if (quantityChange < 0) {
        throw new RpcException('Cannot reduce stock below 0 for non-existent inventory record');
      }
      // Create new record
      inventory = this.inventoryRepository.create({
        productId,
        location,
        currentQuantity: quantityChange,
      });
      const savedNew = await this.inventoryRepository.save(inventory);
      this.checkAndEmitAlert(productId, savedNew.currentQuantity);
      return savedNew;
    }

    if (inventory.currentQuantity + quantityChange < 0) {
      throw new RpcException('Insufficient stock');
    }

    inventory.currentQuantity += quantityChange;
    const savedUpdate = await this.inventoryRepository.save(inventory);
    this.checkAndEmitAlert(productId, savedUpdate.currentQuantity);
    return savedUpdate;
  }

  // Estimates annualized demand for a product from its OUTBOUND transaction history.
  private async estimateAnnualDemand(productId: string): Promise<number> {
    try {
      const transactions = await firstValueFrom(
        this.transactionClient.send('transaction.findByProduct', productId),
      );
      const outbound = (transactions || []).filter((t) => t.type === 'OUTBOUND');
      if (outbound.length === 0) {
        return DEFAULT_ANNUAL_DEMAND;
      }
      const totalQty = outbound.reduce((sum, t) => sum + (t.quantity || 0), 0);
      const timestamps = outbound.map((t) => new Date(t.createdAt).getTime());
      const spanDays = Math.max(1, (Date.now() - Math.min(...timestamps)) / 86400000);
      return Math.max(1, (totalQty / spanDays) * 365);
    } catch (e) {
      this.logger.warn(`Could not reach Transaction Service to estimate demand for ${productId}: ${e.message}`);
      return DEFAULT_ANNUAL_DEMAND;
    }
  }

  // Economic Order Quantity: EOQ = sqrt(2 * D * S / H)
  //   D = estimated annual demand, S = ordering cost/order, H = annual holding cost/unit
  async calculateEOQ(product: Product): Promise<{ eoq: number; annualDemand: number }> {
    const annualDemand = await this.estimateAnnualDemand(product.id);
    const orderingCost = Number(product.orderingCost) || DEFAULT_ORDERING_COST;
    const holdingCostRate = Number(product.holdingCostRate) || DEFAULT_HOLDING_COST_RATE;
    const unitPrice = Number(product.price) || 1;
    const holdingCost = holdingCostRate * unitPrice;

    const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
    return { eoq: Math.round(eoq), annualDemand: Math.round(annualDemand) };
  }

  async getReorderInfo(productId: string) {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      throw new RpcException('Product not found');
    }
    const records = await this.getStock(productId);
    const currentStock = records.reduce((sum, r) => sum + (r.currentQuantity || 0), 0);
    const { eoq, annualDemand } = await this.calculateEOQ(product);

    return {
      productId,
      currentStock,
      eoq,
      annualDemand,
      lowStock: currentStock < eoq,
    };
  }

  private async checkAndEmitAlert(productId: string, currentQuantity: number) {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) return;

    const { eoq } = await this.calculateEOQ(product);
    if (currentQuantity < eoq) {
      this.logger.log(`Stock (${currentQuantity}) below EOQ threshold (${eoq}) for ${product.name}, emitting alert.`);
      this.notificationClient.emit('product.stock.changed', {
        productId,
        productName: product.name,
        newStock: currentQuantity,
        eoq,
      });
    }
  }
}
