import { Controller, Get, Post, Inject, Param, UseGuards, Put, Delete } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(AuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
  ) {}

  @RequirePermissions('alerts:read')
  @Get()
  getAlerts() {
    return this.notificationClient.send('notification.get_alerts', {});
  }

  @RequirePermissions('alerts:read')
  @Post('sync')
  async syncAlerts() {
    const lowStockItems: any[] = await firstValueFrom(
      this.inventoryClient.send('stock.get_low_stock', {}),
    );
    return firstValueFrom(
      this.notificationClient.send('notification.sync_live_low_stock', {
        lowStockItems: Array.isArray(lowStockItems) ? lowStockItems : [],
      }),
    );
  }

  @RequirePermissions('alerts:read')
  @Put(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationClient.send('notification.mark_as_read', id);
  }

  @RequirePermissions('alerts:manage')
  @Delete(':id')
  deleteAlert(@Param('id') id: string) {
    return this.notificationClient.send('notification.delete', id);
  }
}
