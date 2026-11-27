import { Controller, Get, Post, Body, Param, Query, Inject, UseGuards, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions, RequireAnyPermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
@UseGuards(AuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(
    @Inject('ORDER_SERVICE') private readonly orderClient: ClientProxy,
  ) {}

  @RequirePermissions('orders:create')
  @Post()
  async createOrder(@Body() body: any) {
    return firstValueFrom(this.orderClient.send('order.create', body));
  }

  @RequirePermissions('orders:read')
  @Get()
  async findAllOrders(@Query('status') status?: string, @Query('search') search?: string) {
    return firstValueFrom(this.orderClient.send('order.find_all', { status, search }));
  }

  @RequirePermissions('orders:read')
  @Get(':id')
  async findOneOrder(@Param('id') id: string) {
    return firstValueFrom(this.orderClient.send('order.find_one', id));
  }

  @RequirePermissions('orders:read')
  @Get(':id/pick-list')
  async getPickList(@Param('id') id: string) {
    return firstValueFrom(this.orderClient.send('order.get_pick_list', id));
  }

  @RequirePermissions('orders:pick')
  @Post('pick-list-item/confirm')
  async confirmPickItem(
    @Body() body: { itemId: string; pickedQuantity: number; serialNumbers?: string },
  ) {
    return firstValueFrom(this.orderClient.send('order.confirm_pick_item', body));
  }

  @RequirePermissions('orders:dispatch')
  @Post(':id/dispatch')
  async dispatchOrder(@Param('id') id: string) {
    return firstValueFrom(this.orderClient.send('order.dispatch', id));
  }

  @RequireAnyPermissions('orders:create', 'orders:dispatch')
  @Post(':id/cancel')
  async cancelOrder(@Param('id') id: string) {
    const res = await firstValueFrom(this.orderClient.send('order.cancel', id));
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Không thể hủy đơn hàng');
    }
    return res?.data || res;
  }
}
