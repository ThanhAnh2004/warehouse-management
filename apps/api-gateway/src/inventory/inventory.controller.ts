import { Body, Controller, Get, Inject, Param, Post, UseGuards, UseInterceptors, UploadedFile, Query, UsePipes, ValidationPipe, Patch, Delete } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Inventory')
@ApiBearerAuth('JWT-auth')
@Controller('inventory')
@UseGuards(AuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  @Post('products')
  @RequirePermissions('products:create')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: join(__dirname, '..', '..', 'public', 'uploads'),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
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
  createProduct(@Body() createProductDto: any, @UploadedFile() file: Express.Multer.File) {
    console.log('UPLOAD RECEIVED BODY:', createProductDto);
    console.log('UPLOAD RECEIVED FILE:', file);
    createProductDto = createProductDto || {};
    if (file) {
      createProductDto.imageUrl = `http://localhost:8000/uploads/${file.filename}`;
    }
    if (createProductDto.price) {
      createProductDto.price = Number(createProductDto.price);
    }
    if (createProductDto.quantity) {
      createProductDto.quantity = Number(createProductDto.quantity);
    }
    return this.inventoryClient.send('product.create', createProductDto);
  }

  @Patch('products/:sku')
  @RequirePermissions('products:update')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({
      destination: join(__dirname, '..', '..', 'public', 'uploads'),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
      }
    })
  }))
  async updateProduct(@Param('sku') sku: string, @Body() body: any, @UploadedFile() file: Express.Multer.File) {
    try {
      console.log('API-GATEWAY UPDATE PRODUCT LOG:', { sku, body, file });
      body = body || {};
      if (file) {
        body.imageUrl = `http://localhost:8000/uploads/${file.filename}`;
      }
      if (body.price) {
        body.price = Number(body.price);
      }
      if (body.quantity !== undefined && body.quantity !== null) {
        body.quantity = Number(body.quantity);
      }
      const result = await this.inventoryClient.send('product.update', { sku, updateProductDto: body }).toPromise();
      console.log('API-GATEWAY UPDATE SUCCESS RESULT:', result);
      return result;
    } catch (err) {
      console.error('API-GATEWAY UPDATE FAILED ERROR:', err);
      throw err;
    }
  }

  @Delete('products/:sku')
  @RequirePermissions('products:delete')
  deleteProduct(@Param('sku') sku: string) {
    return this.inventoryClient.send('product.delete', sku);
  }



  @Get('products')
  @RequirePermissions('products:read')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  findAllProducts(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search: string = '',
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: string = 'DESC'
  ) {
    return this.inventoryClient.send('product.find_all', {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      sortBy,
      sortOrder
    });
  }

  @Get('products/:sku')
  @RequirePermissions('products:read')
  findProductBySku(@Param('sku') sku: string) {
    return this.inventoryClient.send('product.find_by_sku', sku);
  }

  @Get('stock/:productId')
  @RequirePermissions('stock:read')
  getStock(@Param('productId') productId: string) {
    return this.inventoryClient.send('inventory.get_stock', productId);
  }

  @Get('forecast/:productId')
  @RequirePermissions('forecast:read')
  async getForecast(@Param('productId') productId: string) {
    // Dùng host/port từ biến môi trường để hoạt động cả khi chạy Docker
    // (trong Docker phải là forecasting-service:8004, không phải localhost).
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
