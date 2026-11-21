import { Controller, Get, Post, Body, Param, Query, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Controller('orders')
export class OrdersController {
  constructor(
    @Inject('ORDER_SERVICE') private readonly orderClient: ClientProxy,
  ) {}

  @Post()
  async createOrder(@Body() body: any) {
    return firstValueFrom(this.orderClient.send('order.create', body));
  }

  @Get()
  async findAllOrders(@Query('status') status?: string, @Query('search') search?: string) {
    return firstValueFrom(this.orderClient.send('order.find_all', { status, search }));
  }

  @Get(':id')
  async findOneOrder(@Param('id') id: string) {
    return firstValueFrom(this.orderClient.send('order.find_one', id));
  }

  @Get(':id/pick-list')
  async getPickList(@Param('id') id: string) {
    return firstValueFrom(this.orderClient.send('order.get_pick_list', id));
  }

  @Post('pick-list-item/confirm')
  async confirmPickItem(
    @Body() body: { itemId: string; pickedQuantity: number; serialNumbers?: string },
  ) {
    return firstValueFrom(this.orderClient.send('order.confirm_pick_item', body));
  }

  @Post(':id/dispatch')
  async dispatchOrder(@Param('id') id: string) {
    return firstValueFrom(this.orderClient.send('order.dispatch', id));
  }
}
