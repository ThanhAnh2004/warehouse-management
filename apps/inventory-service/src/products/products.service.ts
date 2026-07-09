import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      const product = this.productRepository.create(createProductDto);
      return await this.productRepository.save(product);
    } catch (error) {
      if (error.code === '23505') { // Postgres unique violation code
        throw new RpcException('SKU already exists');
      }
      throw new RpcException(error.message);
    }
  }

  async findAll(): Promise<Product[]> {
    return this.productRepository.find();
  }

  async findBySku(sku: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { sku } });
    if (!product) {
      throw new RpcException('Product not found');
    }
    return product;
  }

  async update(sku: string, updateProductDto: UpdateProductDto): Promise<Product> {
    const product = await this.findBySku(sku);
    
    // Assign updated values
    Object.assign(product, updateProductDto);
    
    return this.productRepository.save(product);
  }

  async delete(sku: string): Promise<{ deleted: boolean }> {
    const result = await this.productRepository.delete({ sku });
    if (result.affected === 0) {
      throw new RpcException('Product not found');
    }
    return { deleted: true };
  }
}
