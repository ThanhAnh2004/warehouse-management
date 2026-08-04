import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @MessagePattern('product.create')
  create(@Payload() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @MessagePattern('product.find_all')
  findAll(@Payload() payload: { page?: number; limit?: number; search?: string; category?: string; sortBy?: string; sortOrder?: string }) {
    return this.productsService.findAll(payload.page, payload.limit, payload.search, payload.category, payload.sortBy, payload.sortOrder);
  }

  @MessagePattern('product.find_by_sku')
  findBySku(@Payload() sku: string) {
    return this.productsService.findBySku(sku);
  }

  @MessagePattern('product.update_by_sku')
  updateBySku(@Payload() payload: { sku: string; data: UpdateProductDto; updateProductDto?: UpdateProductDto }) {
    const updateData = payload.data || payload.updateProductDto || payload;
    return this.productsService.update(payload.sku, updateData);
  }

  @MessagePattern('product.update')
  update(@Payload() payload: { sku: string; updateProductDto?: UpdateProductDto; data?: UpdateProductDto }) {
    const updateData = payload.data || payload.updateProductDto || payload;
    return this.productsService.update(payload.sku, updateData);
  }

  @MessagePattern('product.delete_by_sku')
  deleteBySku(@Payload() payload: any) {
    const sku = typeof payload === 'string' ? payload : payload?.sku;
    return this.productsService.delete(sku);
  }

  @MessagePattern('product.delete')
  delete(@Payload() payload: any) {
    const sku = typeof payload === 'string' ? payload : payload?.sku;
    return this.productsService.delete(sku);
  }
}
