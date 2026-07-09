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
  findAll() {
    return this.productsService.findAll();
  }

  @MessagePattern('product.find_by_sku')
  findBySku(@Payload() sku: string) {
    return this.productsService.findBySku(sku);
  }

  @MessagePattern('product.update')
  update(@Payload() payload: { sku: string; updateProductDto: UpdateProductDto }) {
    return this.productsService.update(payload.sku, payload.updateProductDto);
  }

  @MessagePattern('product.delete')
  delete(@Payload() sku: string) {
    return this.productsService.delete(sku);
  }
}
