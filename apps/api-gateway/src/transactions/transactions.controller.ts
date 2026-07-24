import { Controller, Post, Get, Body, Inject, UseGuards, Request, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { firstValueFrom } from 'rxjs';

@ApiTags('Transactions')
@ApiBearerAuth('JWT-auth')
@Controller('transactions')
@UseGuards(AuthGuard, PermissionsGuard)
export class TransactionsController {
  constructor(
    @Inject('TRANSACTION_SERVICE') private readonly transactionClient: ClientProxy,
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
  ) {}

  @Post()
  @RequirePermissions('transactions:create')
  createTransaction(@Body() body: CreateTransactionDto, @Request() req) {
    const payload = {
      ...body,
      createdBy: req.user.sub,
    };
    return this.transactionClient.send('transaction.create', payload);
  }

  @Get()
  @RequirePermissions('transactions:read')
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
      return this.transactionClient.send('transaction.findByProduct', {
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

    return this.transactionClient.send('transaction.findAll', {
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
}
