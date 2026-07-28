import { Body, Controller, Get, Inject, Param, Patch, Delete, Post, UseGuards, UseInterceptors, UploadedFile, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';

const buildCleanFilename = (originalname: string, defaultPrefix = 'product') => {
  const ext = extname(originalname).toLowerCase();
  const nameWithoutExt = originalname.substring(0, originalname.lastIndexOf('.')) || originalname;
  const cleanName = nameWithoutExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const finalName = cleanName || defaultPrefix;
  const random6 = Math.floor(100000 + Math.random() * 900000).toString();
  return `${finalName}_${random6}${ext}`;
};

@ApiTags('Inventory')
@ApiBearerAuth('JWT-auth')
@Controller('inventory')
@UseGuards(AuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
    @Inject('TRANSACTION_SERVICE') private readonly transactionClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  @Post('products')
  @RequirePermissions('products:create')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = join(__dirname, '..', '..', 'public', 'uploads', 'products');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        cb(null, buildCleanFilename(file.originalname, 'product'));
      }
    })
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        sku: { type: 'string' },
        price: { type: 'number' },
        quantity: { type: 'number' },
        image: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UsePipes(new ValidationPipe({ whitelist: false }))
  async createProduct(@Body() createProductDto: any, @UploadedFile() file: Express.Multer.File) {
    createProductDto = createProductDto || {};
    if (file) {
      createProductDto.imageUrl = `/uploads/products/${file.filename}`;
    }
    if (createProductDto.price) {
      createProductDto.price = Number(createProductDto.price);
    }
    if (createProductDto.orderingCost) {
      createProductDto.orderingCost = Number(createProductDto.orderingCost);
    }
    if (createProductDto.holdingCostRate) {
      createProductDto.holdingCostRate = Number(createProductDto.holdingCostRate);
    }
    if (createProductDto.quantity) {
      createProductDto.quantity = Number(createProductDto.quantity);
    }

    const createdProduct = await firstValueFrom(this.inventoryClient.send('product.create', createProductDto));

    // Auto-create initial INBOUND transaction when a product is created with stock quantity
    const initQty = Number(createProductDto.quantity) || 0;
    if (createdProduct && createdProduct.id && initQty > 0) {
      try {
        await firstValueFrom(this.transactionClient.send('transaction.create', {
          productId: createdProduct.id,
          type: 'INBOUND',
          quantity: initQty,
          locationTo: createProductDto.location || 'A01',
          note: 'Khởi tạo hàng tồn kho khi tạo sản phẩm mới vào danh mục',
          createdBy: createProductDto.createdBy || 'Quản trị viên',
        }));
      } catch (e) {
        // Ignore transaction error if service unreachable
      }
    }

    return createdProduct;
  }

  @Patch('products/:sku')
  @RequirePermissions('products:update')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = join(__dirname, '..', '..', 'public', 'uploads', 'products');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        cb(null, buildCleanFilename(file.originalname, 'product'));
      }
    })
  }))
  @ApiConsumes('multipart/form-data')
  updateProduct(
    @Param('sku') sku: string,
    @Body() updateProductDto: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    updateProductDto = updateProductDto || {};
    if (file) {
      updateProductDto.imageUrl = `/uploads/products/${file.filename}`;
    }
    if (updateProductDto.price) {
      updateProductDto.price = Number(updateProductDto.price);
    }
    if (updateProductDto.orderingCost) {
      updateProductDto.orderingCost = Number(updateProductDto.orderingCost);
    }
    if (updateProductDto.holdingCostRate) {
      updateProductDto.holdingCostRate = Number(updateProductDto.holdingCostRate);
    }
    if (updateProductDto.quantity) {
      updateProductDto.quantity = Number(updateProductDto.quantity);
    }
    return this.inventoryClient.send('product.update_by_sku', { sku, data: updateProductDto });
  }

  @Get('products')
  @RequirePermissions('products:read')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  findAllProducts(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search: string = '',
    @Query('category') category: string = '',
  ) {
    return this.inventoryClient.send('product.find_all', {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10,
      search,
      category,
    });
  }

  @Get('products/:sku')
  @RequirePermissions('products:read')
  findProductBySku(@Param('sku') sku: string) {
    return this.inventoryClient.send('product.find_by_sku', sku);
  }

  @Delete('products/:sku')
  @RequirePermissions('products:delete')
  deleteProductBySku(@Param('sku') sku: string) {
    return this.inventoryClient.send('product.delete_by_sku', sku);
  }

  @Get('stock/:productId')
  @RequirePermissions('stock:read')
  getStock(@Param('productId') productId: string) {
    return this.inventoryClient.send('inventory.get_stock', productId);
  }

  @Get('reorder/:productId')
  @RequirePermissions('stock:read')
  getReorderInfo(@Param('productId') productId: string) {
    return this.inventoryClient.send('inventory.get_reorder_info', productId);
  }

  @Get('locations')
  @RequirePermissions('stock:read')
  getAllLocations() {
    return this.inventoryClient.send('location.find_all', {});
  }

  @Post('locations')
  @RequirePermissions('products:create')
  createLocation(@Body() dto: any) {
    return this.inventoryClient.send('location.create', dto);
  }

  @Patch('locations/:id')
  @RequirePermissions('products:update')
  updateLocation(@Param('id') id: string, @Body() dto: any) {
    return this.inventoryClient.send('location.update', { id, ...dto });
  }

  @Delete('locations/:id')
  @RequirePermissions('products:delete')
  deleteLocation(@Param('id') id: string) {
    return this.inventoryClient.send('location.delete', id);
  }

  @Get('locations/suggest-putaway')
  @RequirePermissions('stock:read')
  suggestPutaway(@Query('productId') productId: string, @Query('quantity') quantity: string) {
    return this.inventoryClient.send('location.suggest_putaway', {
      productId,
      quantity: parseInt(quantity || '1', 10),
    });
  }

  @Post('locations/relocate')
  @RequirePermissions('products:update')
  async relocateStock(@Body() dto: { productId: string; fromLocation: string; toLocation: string; quantity: number }) {
    const res = await firstValueFrom(this.inventoryClient.send('location.relocate_stock', dto));
    try {
      await firstValueFrom(this.transactionClient.send('transaction.create', {
        productId: dto.productId,
        type: 'TRANSFER',
        quantity: Number(dto.quantity) || 1,
        locationFrom: dto.fromLocation,
        locationTo: dto.toLocation,
        note: `Điều chuyển sản phẩm từ Kệ ${dto.fromLocation} sang Kệ ${dto.toLocation}`,
        createdBy: 'Quản trị viên',
      }));
    } catch (e) {
      // Ignore
    }
    return res;
  }

  @Post('locations/add-stock')
  @RequirePermissions('products:update')
  async addStockToLocation(@Body() dto: { productId: string; location: string; quantity: number }) {
    const qty = Number(dto.quantity) || 0;
    const res = await firstValueFrom(this.inventoryClient.send('inventory.update_stock', {
      productId: dto.productId,
      location: dto.location,
      quantityChange: qty
    }));

    if (qty > 0) {
      try {
        await firstValueFrom(this.transactionClient.send('transaction.create', {
          productId: dto.productId,
          type: 'INBOUND',
          quantity: qty,
          locationTo: dto.location,
          note: `Xếp thêm sản phẩm trực tiếp vào Kệ ${dto.location}`,
          createdBy: 'Quản trị viên',
        }));
      } catch (e) {
        // Ignore
      }
    }

    return res;
  }

  @Get('forecast/:productId')
  @RequirePermissions('forecast:read')
  async getForecast(@Param('productId') productId: string) {
    const host = this.configService.get<string>('FORECASTING_SERVICE_HOST', 'localhost');
    const port = this.configService.get<number>('FORECASTING_SERVICE_PORT', 8004);
    try {
      const response = await fetch(`http://${host}:${port}/forecast/${productId}?days=7`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Forecasting service error: ${errorData.detail}`);
      }
      return await response.json();
    } catch (error) {
      return { success: false, message: 'Could not fetch forecast data', error: error.message };
    }
  }
}
