import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as net from 'net';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

interface ServiceHealth {
  name: string;
  host: string;
  port: number;
  status: 'UP' | 'DOWN';
  latencyMs: number | null;
}

function checkTcp(host: string, port: number, timeoutMs = 2000): Promise<{ status: 'UP' | 'DOWN'; latencyMs: number | null }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (status: 'UP' | 'DOWN') => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ status, latencyMs: status === 'UP' ? Date.now() - start : null });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('UP'));
    socket.once('timeout', () => finish('DOWN'));
    socket.once('error', () => finish('DOWN'));
    socket.connect(port, host);
  });
}

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly configService: ConfigService) {}

  @Get('services/health')
  @Roles('Admin')
  async getServicesHealth(): Promise<ServiceHealth[]> {
    const services = [
      {
        name: 'Identity Service',
        host: this.configService.get<string>('IDENTITY_SERVICE_HOST', 'localhost'),
        port: this.configService.get<number>('IDENTITY_SERVICE_PORT', 8001),
      },
      {
        name: 'Inventory Service',
        host: this.configService.get<string>('INVENTORY_SERVICE_HOST', 'localhost'),
        port: this.configService.get<number>('INVENTORY_SERVICE_PORT', 8002),
      },
      {
        name: 'Transaction Service',
        host: this.configService.get<string>('TRANSACTION_SERVICE_HOST', 'localhost'),
        port: this.configService.get<number>('TRANSACTION_SERVICE_PORT', 8003),
      },
      {
        name: 'Notification Service',
        host: this.configService.get<string>('NOTIFICATION_SERVICE_HOST', 'localhost'),
        port: this.configService.get<number>('NOTIFICATION_SERVICE_PORT', 3004),
      },
      {
        name: 'Reporting Service',
        host: this.configService.get<string>('REPORTING_SERVICE_HOST', 'localhost'),
        port: this.configService.get<number>('REPORTING_SERVICE_PORT', 3005),
      },
      {
        name: 'Data Processing Service',
        host: this.configService.get<string>('DATA_PROCESSING_SERVICE_HOST', 'localhost'),
        port: this.configService.get<number>('DATA_PROCESSING_SERVICE_PORT', 8005),
      },
      {
        name: 'Forecasting Service',
        host: this.configService.get<string>('FORECASTING_SERVICE_HOST', 'localhost'),
        port: this.configService.get<number>('FORECASTING_SERVICE_PORT', 8004),
      },
    ];

    const results = await Promise.all(
      services.map(async (svc) => {
        const { status, latencyMs } = await checkTcp(svc.host, svc.port);
        return { ...svc, status, latencyMs };
      }),
    );

    return results;
  }
}
