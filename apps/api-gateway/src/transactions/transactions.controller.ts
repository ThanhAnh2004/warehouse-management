import { Controller, Post, Get, Body, Inject, UseGuards, Request, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

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
  createTransaction(@Body() body: any, @Request() req) {
    // req.user được gán từ AuthGuard
    const payload = {
      ...body,
      createdBy: req.user.userId,
    };
    return this.transactionClient.send('transaction.create', payload);
  }

  @Get()
  @RequirePermissions('transactions:read')
  getTransactions(
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.transactionClient.send('transaction.findAll', {
      productId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search: search || '',
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'DESC'
    });
  }
}
