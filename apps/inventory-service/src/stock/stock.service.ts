import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { Product } from '../products/entities/product.entity';
import { UpdateStockDto } from './dto/update-stock.dto';
import { RpcException, ClientProxy } from '@nestjs/microservices';

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
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
      await this.checkAndEmitAlert(productId, savedNew.currentQuantity);
      return savedNew;
    }

    if (inventory.currentQuantity + quantityChange < 0) {
      throw new RpcException('Insufficient stock');
    }

    inventory.currentQuantity += quantityChange;
    const savedUpdate = await this.inventoryRepository.save(inventory);
    await this.checkAndEmitAlert(productId, savedUpdate.currentQuantity);
    return savedUpdate;
  }

  private async checkAndEmitAlert(productId: string, currentQuantity: number) {
    if (currentQuantity < 20) {
      const product = await this.productRepository.findOne({ where: { id: productId } });
      const productName = product ? product.name : `Product ID: ${productId}`;
      
      this.logger.log(`Stock below 20 for ${productName}, emitting alert.`);
      this.notificationClient.emit('product.stock.changed', { 
        productId, 
        productName,
        newStock: currentQuantity 
      });
    }
  }
}
