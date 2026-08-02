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

  @MessagePattern('location.create')
  createLocation(@Payload() data: any) {
    return this.stockService.createLocation(data);
  }

  @MessagePattern('location.update')
  updateLocation(@Payload() data: { id: string; [key: string]: any }) {
    return this.stockService.updateLocation(data.id, data);
  }

  @MessagePattern('location.delete')
  deleteLocation(@Payload() id: string) {
    return this.stockService.deleteLocation(id);
  }

  @MessagePattern('location.suggest_putaway')
  suggestPutaway(@Payload() data: { productId: string; quantity: number }) {
    return this.stockService.suggestPutaway(data.productId, data.quantity || 1);
  }

  @MessagePattern('location.relocate_stock')
  relocateStock(@Payload() data: { productId: string; fromLocation: string; toLocation: string; quantity: number }) {
    return this.stockService.relocateStock(data);
  }

  @MessagePattern('location.unallocated_products')
  getUnallocatedProducts() {
    return this.stockService.getUnallocatedProducts();
  }
}
