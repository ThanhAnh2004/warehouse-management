import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern('order.create')
  async createOrder(@Payload() dto: CreateOrderDto) {
    return this.ordersService.createOrder(dto);
  }

  @MessagePattern('order.find_all')
  async findAllOrders(@Payload() query: { status?: string; search?: string } = {}) {
    return this.ordersService.findAllOrders(query);
  }

  @MessagePattern('order.find_one')
  async findOneOrder(@Payload() id: string) {
    return this.ordersService.findOneOrder(id);
  }

  @MessagePattern('order.get_pick_list')
  async getPickList(@Payload() orderId: string) {
    return this.ordersService.findPickListByOrderId(orderId);
  }

  @MessagePattern('order.confirm_pick_item')
  async confirmPickItem(
    @Payload() data: { itemId: string; pickedQuantity: number; serialNumbers?: string },
  ) {
    return this.ordersService.confirmPickItem(
      data.itemId,
      data.pickedQuantity,
      data.serialNumbers,
    );
  }

  @MessagePattern('order.dispatch')
  async dispatchOrder(@Payload() orderId: string) {
    return this.ordersService.dispatchOrder(orderId);
  }

  @MessagePattern('order.cancel')
  async cancelOrder(@Payload() orderId: string) {
    return this.ordersService.cancelOrder(orderId);
  }
}
