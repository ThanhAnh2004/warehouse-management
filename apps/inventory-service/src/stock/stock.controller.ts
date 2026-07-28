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

  @MessagePattern('location.find_all')
  getAllLocations() {
    return this.stockService.getAllLocationsWithOccupancy();
  }

  @MessagePattern('location.suggest_putaway')
  suggestPutaway(@Payload() data: { productId: string; quantity: number }) {
    return this.stockService.suggestPutaway(data.productId, data.quantity || 1);
  }

  @MessagePattern('location.relocate_stock')
  relocateStock(@Payload() data: { productId: string; fromLocation: string; toLocation: string; quantity: number }) {
    return this.stockService.relocateStock(data);
  }
}
