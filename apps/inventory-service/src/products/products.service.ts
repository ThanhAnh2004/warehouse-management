import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Product } from './entities/product.entity';
import { Inventory } from '../stock/entities/inventory.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      const { quantity, ...productData } = createProductDto;
      const product = this.productRepository.create(productData);
      const savedProduct = await this.productRepository.save(product);

      // Create initial stock in inventories table
      const initialQuantity = quantity ? Number(quantity) : 0;
      const inventory = this.inventoryRepository.create({
        productId: savedProduct.id,
        location: 'DEFAULT_WAREHOUSE',
        currentQuantity: initialQuantity,
        reservedQuantity: 0,
        createdBy: createProductDto.createdBy || 'system',
        updatedBy: createProductDto.updatedBy || 'system',
      });
      await this.inventoryRepository.save(inventory);

      return savedProduct;
    } catch (error) {
      if (error.code === '23505') { // Postgres unique violation code
        throw new RpcException('SKU already exists');
      }
      throw new RpcException(error.message);
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search: string = '',
    sortBy: string = 'createdAt',
    sortOrder: string = 'DESC'
  ): Promise<{ data: any[], total: number, page: number, limit: number }> {
    const skip = (page - 1) * limit;
    
    // Search by name OR sku
    const where = search 
      ? [
          { name: ILike(`%${search}%`) },
          { sku: ILike(`%${search}%`) }
        ]
      : {};
    
    let products: any[];
    let total: number;

    if (sortBy === 'quantity') {
      // Fetch all products matching search to perform correct sorting in memory
      const allProducts = await this.productRepository.find({
        where,
        order: { createdAt: 'DESC' }
      });

      const productsWithQty = await Promise.all(allProducts.map(async (product) => {
        const inventories = await this.inventoryRepository.find({ where: { productId: product.id } });
        const currentQuantity = inventories.reduce((sum, item) => sum + (item.currentQuantity || 0), 0);
        return {
          ...product,
          quantity: currentQuantity
        };
      }));

      const actualSortOrder = sortOrder === 'ASC' ? 1 : -1;
      productsWithQty.sort((a, b) => (a.quantity - b.quantity) * actualSortOrder);

      total = productsWithQty.length;
      products = productsWithQty.slice(skip, skip + limit);
    } else {
      const allowedSortFields = ['createdAt', 'name', 'price', 'sku'];
      const actualSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const actualSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
      const order = { [actualSortBy]: actualSortOrder };

      const [dbProducts, dbTotal] = await this.productRepository.findAndCount({
        where,
        take: limit,
        skip,
        order
      });

      total = dbTotal;
      products = await Promise.all(dbProducts.map(async (product) => {
        const inventories = await this.inventoryRepository.find({ where: { productId: product.id } });
        const currentQuantity = inventories.reduce((sum, item) => sum + (item.currentQuantity || 0), 0);
        return {
          ...product,
          quantity: currentQuantity
        };
      }));
    }

    return {
      data: products,
      total,
      page,
      limit
    };
  }

  async findBySku(sku: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { sku } });
    if (!product) {
      throw new RpcException('Product not found');
    }
    return product;
  }

  async update(sku: string, updateProductDto: UpdateProductDto): Promise<Product> {
    console.log('INVENTORY-SERVICE UPDATE LOG:', { sku, updateProductDto });
    const product = await this.findBySku(sku);
    const { quantity, ...productData } = updateProductDto as any;
    
    // Assign updated values
    Object.assign(product, productData);
    const savedProduct = await this.productRepository.save(product);

    if (quantity !== undefined && quantity !== null) {
      let inventory = await this.inventoryRepository.findOne({ where: { productId: product.id } });
      if (!inventory) {
        inventory = this.inventoryRepository.create({
          productId: product.id,
          location: 'DEFAULT_WAREHOUSE',
          currentQuantity: Number(quantity),
          reservedQuantity: 0,
          createdBy: 'system',
          updatedBy: 'system',
        });
      } else {
        inventory.currentQuantity = Number(quantity);
      }
      await this.inventoryRepository.save(inventory);
    }
    
    return savedProduct;
  }

  async delete(sku: string): Promise<{ deleted: boolean }> {
    const result = await this.productRepository.delete({ sku });
    if (result.affected === 0) {
      throw new RpcException('Product not found');
    }
    return { deleted: true };
  }
}
