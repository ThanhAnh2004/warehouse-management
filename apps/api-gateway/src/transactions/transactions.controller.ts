import { Controller, Post, Get, Patch, Delete, Body, Inject, UseGuards, Request, Query, Param } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions, RequireAnyPermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { firstValueFrom } from 'rxjs';

@ApiTags('Transactions')
@ApiBearerAuth('JWT-auth')
@Controller('transactions')
@UseGuards(AuthGuard, PermissionsGuard)
export class TransactionsController {
  constructor(
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
  ) {}

  // Dedicated Stock Adjustment endpoints (Kiểm kê & Điều chỉnh kho)
  @Get('adjustments')
  @RequirePermissions('adjustments:read')
  async getAdjustments(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('startDate') startDate: string = '',
    @Query('endDate') endDate: string = '',
  ) {
    return this.inventoryClient.send('transaction.findAll', {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      type: 'ADJUSTMENT',
      startDate,
      endDate,
    });
  }

  @Post('adjustments')
  @RequirePermissions('adjustments:create')
  createAdjustment(@Body() body: CreateTransactionDto, @Request() req) {
    const payload = {
      ...body,
      type: 'ADJUSTMENT',
      createdBy: req.user.sub,
    };
    return this.inventoryClient.send('transaction.create', payload);
  }

  @Patch('adjustments/:id')
  @RequirePermissions('adjustments:update')
  updateAdjustment(@Param('id') id: string, @Body() body: any) {
    return this.inventoryClient.send('transaction.update', { id, ...body });
  }

  @Delete('adjustments/:id')
  @RequirePermissions('adjustments:delete')
  deleteAdjustment(@Param('id') id: string) {
    return this.inventoryClient.send('transaction.delete', id);
  }

  @Post()
  @RequirePermissions('stock:update')
  createTransaction(@Body() body: CreateTransactionDto, @Request() req) {
    const payload = {
      ...body,
      createdBy: req.user.sub,
    };
    return this.inventoryClient.send('transaction.create', payload);
  }

  @Patch(':id')
  @RequirePermissions('adjustments:update')
  updateTransaction(@Param('id') id: string, @Body() body: any) {
    return this.inventoryClient.send('transaction.update', { id, ...body });
  }

  @Delete(':id')
  @RequirePermissions('adjustments:delete')
  deleteTransaction(@Param('id') id: string) {
    return this.inventoryClient.send('transaction.delete', id);
  }

  @Get()
  @RequireAnyPermissions('transactions:read', 'reports:read', 'adjustments:read')
  @ApiQuery({ name: 'productId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getTransactions(
    @Query('productId') productId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
    @Query('search') search: string = '',
    @Query('type') type: string = '',
    @Query('status') status: string = '',
    @Query('startDate') startDate: string = '',
    @Query('endDate') endDate: string = '',
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (productId) {
      return this.inventoryClient.send('transaction.findByProduct', {
        productId,
        page: pageNum,
        limit: limitNum,
      });
    }

    let searchProductIds: string[] = [];
    if (search && search.trim()) {
      try {
        const prodResult = await firstValueFrom(
          this.inventoryClient.send('product.find_all', { search: search.trim(), limit: 1000 })
        );
        const products = prodResult?.data || [];
        searchProductIds = products.map((p: any) => p.id);
      } catch (e) {
        console.error('Failed to resolve search product IDs:', e);
      }
    }

    return this.inventoryClient.send('transaction.findAll', {
      page: pageNum,
      limit: limitNum,
      sortBy,
      sortOrder,
      search: search.trim(),
      productIds: searchProductIds,
      type,
      status,
      startDate,
      endDate,
    });
  }

  @Get('sagas')
  @RequirePermissions('transactions:read')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  getAllSagas(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('status') status: string = '',
  ) {
    return this.inventoryClient.send('transaction.getAllSagas', {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
    });
  }

  @Get(':id/saga')
  @RequirePermissions('transactions:read')
  getTransactionSaga(@Param('id') id: string) {
    return this.inventoryClient.send('transaction.getSaga', { transactionId: id });
  }
}
