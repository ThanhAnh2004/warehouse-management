import { Controller, Post, Get, Body, Inject, UseGuards, Request, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@ApiTags('Transactions')
@ApiBearerAuth('JWT-auth')
@Controller('transactions')
@UseGuards(AuthGuard, PermissionsGuard)
export class TransactionsController {
  constructor(
    @Inject('TRANSACTION_SERVICE') private readonly transactionClient: ClientProxy,
  ) {}

  @Post()
  @RequirePermissions('transactions:create')
  createTransaction(@Body() body: CreateTransactionDto, @Request() req) {
    // req.user được gán từ AuthGuard = payload JWT giải mã trực tiếp (auth.service.ts ký với
    // field "sub", không phải "userId") - trước đây đọc sai field nên createdBy luôn rỗng.
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
  getTransactions(
    @Query('productId') productId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
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
    return this.transactionClient.send('transaction.findAll', { page: pageNum, limit: limitNum });
  }
}
