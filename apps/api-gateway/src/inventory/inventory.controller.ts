import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
  ) {}

  @Post('products')
  createProduct(@Body() createProductDto: any) {
    return this.inventoryClient.send('product.create', createProductDto);
  }

  @Get('products')
  findAllProducts() {
    return this.inventoryClient.send('product.find_all', {});
  }

  @Get('products/:sku')
  findProductBySku(@Param('sku') sku: string) {
    return this.inventoryClient.send('product.find_by_sku', sku);
  }

  @Get('stock/:productId')
  getStock(@Param('productId') productId: string) {
    return this.inventoryClient.send('inventory.get_stock', productId);
  }

  @Put('stock')
  updateStock(@Body() updateStockDto: any) {
    return this.inventoryClient.send('inventory.update_stock', updateStockDto);
  }
}
