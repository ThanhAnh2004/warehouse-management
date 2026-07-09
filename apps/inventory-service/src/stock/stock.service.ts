import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { UpdateStockDto } from './dto/update-stock.dto';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
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
      return this.inventoryRepository.save(inventory);
    }

    if (inventory.currentQuantity + quantityChange < 0) {
      throw new RpcException('Insufficient stock');
    }

    inventory.currentQuantity += quantityChange;
    return this.inventoryRepository.save(inventory);
  }
}
