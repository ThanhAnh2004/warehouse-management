import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { StockService } from './stock.service';
import { UpdateStockDto } from './dto/update-stock.dto';

@Controller()
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @MessagePattern('inventory.get_stock')
  getStock(@Payload() productId: string) {
    return this.stockService.getStock(productId);
  }

  @MessagePattern('inventory.update_stock')
  updateStock(@Payload() updateStockDto: UpdateStockDto) {
    return this.stockService.updateStock(updateStockDto);
  }

  @MessagePattern('inventory.get_reorder_info')
  getReorderInfo(@Payload() productId: string) {
    return this.stockService.getReorderInfo(productId);
  }
}
