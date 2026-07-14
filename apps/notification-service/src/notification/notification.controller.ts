import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern('product.stock.changed')
  async handleStockChanged(@Payload() data: { productId: string, productName: string, newStock: number }) {
    await this.notificationService.checkAndCreateAlert(data);
  }

  @MessagePattern('notification.get_alerts')
  async getAlerts() {
    return this.notificationService.getAlerts();
  }

  @MessagePattern('notification.mark_as_read')
  async markAsRead(@Payload() id: string) {
    return this.notificationService.markAsRead(id);
  }

  @MessagePattern('notification.delete')
  async deleteAlert(@Payload() id: string) {
    return this.notificationService.deleteAlert(id);
  }
}
