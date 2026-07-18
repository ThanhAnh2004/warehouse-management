import { Controller, Get, Inject, Param, UseGuards, Put, Delete } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  @Get()
  @Roles('Admin', 'Manager')
  getAlerts() {
    return this.notificationClient.send('notification.get_alerts', {});
  }

  @Put(':id/read')
  @Roles('Admin', 'Manager')
  markAsRead(@Param('id') id: string) {
    return this.notificationClient.send('notification.mark_as_read', id);
  }

  @Delete(':id')
  @Roles('Admin', 'Manager')
  deleteAlert(@Param('id') id: string) {
    return this.notificationClient.send('notification.delete', id);
  }
}
