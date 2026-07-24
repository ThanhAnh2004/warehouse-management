import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

interface ServiceCheck {
  name: string;
  category: 'gateway' | 'microservice' | 'python' | 'database' | 'broker';
  host: string;
  port: number;
}

@ApiTags('System')
@ApiBearerAuth('JWT-auth')
@Controller('system')
@UseGuards(AuthGuard, RolesGuard)
export class SystemController {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Giám sát hạ tầng Microservices (đề tài: "Quản trị hệ thống - Giám sát, quản lý và điều
   * phối các dịch vụ trong hệ thống, đảm bảo tính sẵn sàng và ổn định").
   *
   * Kiểm tra khả năng kết nối (reachability) tới từng service/CSDL và đo độ trễ,
   * trả về trạng thái up/down để Web Dashboard hiển thị.
   */
  @Get('health')
  @Roles('Admin')
  async getSystemHealth() {
    const cfg = (key: string, fallback: string) => this.configService.get<string>(key, fallback);

    const targets: ServiceCheck[] = [
      { name: 'API Gateway', category: 'gateway', host: 'self', port: Number(cfg('API_GATEWAY_PORT', '8000')) },
      { name: 'Identity & Auth Service', category: 'microservice', host: cfg('IDENTITY_SERVICE_HOST', 'localhost'), port: Number(cfg('IDENTITY_SERVICE_PORT', '8001')) },
      { name: 'Inventory Service', category: 'microservice', host: cfg('INVENTORY_SERVICE_HOST', 'localhost'), port: Number(cfg('INVENTORY_SERVICE_PORT', '8002')) },
      { name: 'Transaction Service', category: 'microservice', host: cfg('TRANSACTION_SERVICE_HOST', 'localhost'), port: Number(cfg('TRANSACTION_SERVICE_PORT', '8003')) },
      { name: 'Notification Service', category: 'microservice', host: cfg('NOTIFICATION_SERVICE_HOST', 'localhost'), port: Number(cfg('NOTIFICATION_SERVICE_PORT', '3004')) },
      { name: 'Reporting Service', category: 'microservice', host: cfg('REPORTING_SERVICE_HOST', 'localhost'), port: Number(cfg('REPORTING_SERVICE_PORT', '3005')) },
      { name: 'Forecasting Service', category: 'python', host: cfg('FORECASTING_SERVICE_HOST', 'localhost'), port: Number(cfg('FORECASTING_SERVICE_PORT', '8004')) },
      { name: 'Data Processing Service', category: 'python', host: cfg('DATA_PROCESSING_SERVICE_HOST', 'localhost'), port: Number(cfg('DATA_PROCESSING_SERVICE_PORT', '8005')) },
      { name: 'PostgreSQL', category: 'database', host: cfg('POSTGRES_HOST', 'localhost'), port: Number(cfg('POSTGRES_PORT', '5432')) },
      { name: 'MongoDB', category: 'database', host: cfg('MONGODB_HOST', 'localhost'), port: Number(cfg('MONGODB_PORT', '27017')) },
      { name: 'RabbitMQ', category: 'broker', host: cfg('RABBITMQ_HOST', 'localhost'), port: Number(cfg('RABBITMQ_PORT', '5672')) },
    ];

    const results = await Promise.all(
      targets.map(async (t) => {
        // API Gateway đang xử lý request này nên chắc chắn đang chạy
        if (t.host === 'self') {
          return { ...t, host: 'localhost', status: 'up' as const, latencyMs: 0 };
        }
        if (t.category === 'python') {
          const { up, latencyMs } = await this.checkHttp(`http://${t.host}:${t.port}/health`);
          return { ...t, status: up ? ('up' as const) : ('down' as const), latencyMs };
        }
        const { up, latencyMs } = await this.checkTcp(t.host, t.port);
        return { ...t, status: up ? ('up' as const) : ('down' as const), latencyMs };
      }),
    );

    const up = results.filter((r) => r.status === 'up').length;

    return {
      checkedAt: new Date().toISOString(),
      summary: { total: results.length, up, down: results.length - up },
      services: results,
    };
  }

  private checkTcp(host: string, port: number, timeout = 1500): Promise<{ up: boolean; latencyMs: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const finish = (up: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ up, latencyMs: Date.now() - start });
      };
      socket.setTimeout(timeout);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, host);
    });
  }

  private async checkHttp(url: string, timeout = 1500): Promise<{ up: boolean; latencyMs: number }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return { up: res.ok, latencyMs: Date.now() - start };
    } catch {
      return { up: false, latencyMs: Date.now() - start };
    } finally {
      clearTimeout(timer);
    }
  }
}
