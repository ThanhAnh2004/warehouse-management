import { Body, Controller, Get, Inject, Param, Patch, Delete, Post, UseGuards, UseInterceptors, UploadedFile, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Inventory')
@ApiBearerAuth('JWT-auth')
@Controller('inventory')
@UseGuards(AuthGuard, RolesGuard)
export class InventoryController {
  constructor(
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
  ) {}

  @Post('products')
  @Roles('Admin', 'Manager')
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
    if (createProductDto.orderingCost) {
      createProductDto.orderingCost = Number(createProductDto.orderingCost);
    }
    if (createProductDto.holdingCostRate) {
      createProductDto.holdingCostRate = Number(createProductDto.holdingCostRate);
    }
    return this.inventoryClient.send('product.create', createProductDto);
  }

  @Get('products')
  @Roles('Admin', 'Manager', 'Staff')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAllProducts(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search: string = ''
  ) {
    return this.inventoryClient.send('product.find_all', {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search
    });
  }

  @Get('products/:sku')
  @Roles('Admin', 'Manager', 'Staff')
  findProductBySku(@Param('sku') sku: string) {
    return this.inventoryClient.send('product.find_by_sku', sku);
  }

  @Patch('products/:sku')
  @Roles('Admin', 'Manager')
  updateProduct(@Param('sku') sku: string, @Body() updateProductDto: any) {
    return this.inventoryClient.send('product.update', { sku, updateProductDto });
  }

  @Delete('products/:sku')
  @Roles('Admin', 'Manager')
  deleteProduct(@Param('sku') sku: string) {
    return this.inventoryClient.send('product.delete', sku);
  }

  @Get('stock/:productId')
  @Roles('Admin', 'Manager', 'Staff')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30000) // Cache for 30 seconds
  getStock(@Param('productId') productId: string) {
    return this.inventoryClient.send('inventory.get_stock', productId);
  }

  @Get('reorder/:productId')
  @Roles('Admin', 'Manager', 'Staff')
  getReorderInfo(@Param('productId') productId: string) {
    return this.inventoryClient.send('inventory.get_reorder_info', productId);
  }

  @Get('forecast/:productId')
  @Roles('Admin', 'Manager')
  async getForecast(@Param('productId') productId: string) {
    try {
      const response = await fetch(`http://localhost:8004/forecast/${productId}?days=7`);
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
