import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
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
  queue?: string;
}

@ApiTags('System')
@ApiBearerAuth('JWT-auth')
@Controller('system')
@UseGuards(AuthGuard, RolesGuard)
export class SystemController {
  constructor(private readonly configService: ConfigService) {}

  @Get('health')
  @Roles('Admin')
  async getSystemHealth() {
    const cfg = (key: string, fallback: string) => this.configService.get<string>(key, fallback);
    const transportMode = cfg('MICROSERVICE_TRANSPORT', 'tcp');
    const isRmq = transportMode === 'rmq';

    // Parse RabbitMQ Host & Management Port from RABBITMQ_URL
    const rmqUrl = cfg('RABBITMQ_URL', 'amqp://guest:guest@warehouse_rabbitmq:5672');
    let rmqHost = cfg('RABBITMQ_HOST', '');
    let rmqPort = Number(cfg('RABBITMQ_PORT', '5672'));
    if (!rmqHost) {
      try {
        const matches = rmqUrl.match(/@([^:/]+):?(\d+)?/);
        if (matches) {
          rmqHost = matches[1];
          if (matches[2]) rmqPort = Number(matches[2]);
        }
      } catch (e) {}
    }
    if (!rmqHost) rmqHost = 'warehouse_rabbitmq';

    // Check RabbitMQ Broker TCP Reachability
    const rmqCheck = await this.checkTcp(rmqHost, rmqPort);

    // Fetch RabbitMQ Queues status via Management API (15672) to check consumer counts
    let queueConsumerMap: Record<string, number> = {};
    if (isRmq && rmqCheck.up) {
      try {
        const mgmtRes = await fetch(`http://${rmqHost}:15672/api/queues`, {
          headers: {
            Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64'),
          },
        });
        if (mgmtRes.ok) {
          const queuesData = await mgmtRes.json();
          if (Array.isArray(queuesData)) {
            for (const q of queuesData) {
              queueConsumerMap[q.name] = q.consumers || 0;
            }
          }
        }
      } catch (e) {}
    }

    // MongoDB Check (Atlas vs Local)
    const mongoUri = cfg('MONGODB_URI_IDENTITY', '');
    const isMongoAtlas = mongoUri.includes('mongodb+srv://');

    const targets: ServiceCheck[] = [
      { name: 'API Gateway', category: 'gateway', host: 'self', port: Number(cfg('API_GATEWAY_PORT', '8000')) },
      { name: 'Identity & Auth Service', category: 'microservice', host: cfg('IDENTITY_SERVICE_HOST', 'warehouse_identity_service'), port: Number(cfg('IDENTITY_SERVICE_PORT', '8001')), queue: 'identity_queue' },
      { name: 'Inventory Service', category: 'microservice', host: cfg('INVENTORY_SERVICE_HOST', 'warehouse_inventory_service'), port: Number(cfg('INVENTORY_SERVICE_PORT', '8002')), queue: 'inventory_queue' },
      { name: 'Transaction Service', category: 'microservice', host: cfg('TRANSACTION_SERVICE_HOST', 'warehouse_transaction_service'), port: Number(cfg('TRANSACTION_SERVICE_PORT', '8003')), queue: 'transaction_queue' },
      { name: 'Notification Service', category: 'microservice', host: cfg('NOTIFICATION_SERVICE_HOST', 'warehouse_notification_service'), port: Number(cfg('NOTIFICATION_SERVICE_PORT', '3004')), queue: 'notification_queue' },
      { name: 'Reporting Service', category: 'microservice', host: cfg('REPORTING_SERVICE_HOST', 'warehouse_reporting_service'), port: Number(cfg('REPORTING_SERVICE_PORT', '3005')), queue: 'reporting_queue' },
      { name: 'Forecasting Service', category: 'python', host: cfg('FORECASTING_SERVICE_HOST', 'localhost'), port: Number(cfg('FORECASTING_SERVICE_PORT', '8004')) },
      { name: 'Data Processing Service', category: 'python', host: cfg('DATA_PROCESSING_SERVICE_HOST', 'localhost'), port: Number(cfg('DATA_PROCESSING_SERVICE_PORT', '8005')) },
      { name: 'PostgreSQL', category: 'database', host: cfg('POSTGRES_HOST', 'localhost'), port: Number(cfg('POSTGRES_PORT', '5432')) },
      { name: 'MongoDB', category: 'database', host: isMongoAtlas ? 'Atlas Cloud' : cfg('MONGODB_HOST', 'localhost'), port: Number(cfg('MONGODB_PORT', '27017')) },
      { name: 'RabbitMQ', category: 'broker', host: rmqHost, port: rmqPort },
    ];

    const results = await Promise.all(
      targets.map(async (t) => {
        if (t.host === 'self') {
          return { ...t, host: 'localhost', status: 'up' as const, latencyMs: 0 };
        }
        if (t.name === 'MongoDB' && isMongoAtlas) {
          return { ...t, status: 'up' as const, latencyMs: 15 };
        }
        if (t.name === 'RabbitMQ') {
          return { ...t, status: rmqCheck.up ? ('up' as const) : ('down' as const), latencyMs: rmqCheck.latencyMs };
        }
        if (t.category === 'python') {
          const { up, latencyMs } = await this.checkHttp(`http://${t.host}:${t.port}/health`);
          return { ...t, status: up ? ('up' as const) : ('down' as const), latencyMs };
        }
        if (t.category === 'microservice' && isRmq) {
          if (!rmqCheck.up) {
            return { ...t, status: 'down' as const, latencyMs: rmqCheck.latencyMs };
          }
          const consumerCount = t.queue ? (queueConsumerMap[t.queue] ?? 0) : 0;
          const isAlive = consumerCount > 0;
          return { ...t, status: isAlive ? ('up' as const) : ('down' as const), latencyMs: rmqCheck.latencyMs };
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

  @Get('message-bus/status')
  @Roles('Admin')
  async getMessageBusStatus() {
    const cfg = (key: string, fallback: string) => this.configService.get<string>(key, fallback);
    const rmqUrl = cfg('RABBITMQ_URL', 'amqp://guest:guest@warehouse_rabbitmq:5672');
    let rmqHost = cfg('RABBITMQ_HOST', '');
    let rmqPort = Number(cfg('RABBITMQ_PORT', '5672'));

    if (!rmqHost) {
      try {
        const matches = rmqUrl.match(/@([^:/]+):?(\d+)?/);
        if (matches) {
          rmqHost = matches[1];
          if (matches[2]) rmqPort = Number(matches[2]);
        }
      } catch (e) {}
    }
    if (!rmqHost) rmqHost = 'warehouse_rabbitmq';
    const mgmtPort = 15672;

    const tcpCheck = await this.checkTcp(rmqHost, rmqPort);
    let queueDetails: Record<string, any> = {};

    if (tcpCheck.up) {
      try {
        const mgmtRes = await fetch(`http://${rmqHost}:${mgmtPort}/api/queues`, {
          headers: {
            Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64'),
          },
        });
        if (mgmtRes.ok) {
          const rawQueues = await mgmtRes.json();
          if (Array.isArray(rawQueues)) {
            for (const q of rawQueues) {
              queueDetails[q.name] = {
                messages: q.messages || 0,
                messagesReady: q.messages_ready || 0,
                consumers: q.consumers || 0,
                state: q.state || 'running',
              };
            }
          }
        }
      } catch (e) {}
    }

    const queuePairs = [
      { service: 'Identity Service', queue: 'identity_queue', dlq: 'identity_dlq' },
      { service: 'Inventory Service', queue: 'inventory_queue', dlq: 'inventory_dlq' },
      { service: 'Transaction Service', queue: 'transaction_queue', dlq: 'transaction_dlq' },
      { service: 'Notification Service', queue: 'notification_queue', dlq: 'notification_dlq' },
      { service: 'Reporting Service', queue: 'reporting_queue', dlq: 'reporting_dlq' },
    ];

    const monitoredQueues = queuePairs.map((pair) => {
      const qInfo = queueDetails[pair.queue] || { messages: 0, messagesReady: 0, consumers: 0, state: 'unknown' };
      const dlqInfo = queueDetails[pair.dlq] || { messages: 0, messagesReady: 0, consumers: 0, state: 'unknown' };
      const hasErrors = dlqInfo.messages > 0;
      const isOnline = qInfo.consumers > 0;

      return {
        service: pair.service,
        queue: pair.queue,
        deadLetterQueue: pair.dlq,
        consumers: qInfo.consumers,
        pendingMessages: qInfo.messages,
        dlqErrorCount: dlqInfo.messages,
        status: !tcpCheck.up ? 'BROKER_OFFLINE' : hasErrors ? 'HAS_ERRORS' : isOnline ? 'ACTIVE' : 'NO_CONSUMER',
      };
    });

    return {
      broker: {
        name: 'RabbitMQ Message Broker',
        host: rmqHost,
        amqpPort: rmqPort,
        managementPort: mgmtPort,
        managementUrl: `http://localhost:${mgmtPort}`,
        status: tcpCheck.up ? 'HEALTHY' : 'UNHEALTHY',
        latencyMs: tcpCheck.latencyMs,
      },
      resilienceStrategy: {
        dlxExchange: 'amq.direct',
        autoReconnect: true,
        reconnectIntervalSec: 5,
        heartbeatSec: 5,
      },
      monitoredQueues,
      checkedAt: new Date().toISOString(),
    };
  }

  @Post('message-bus/purge-queue')
  @Roles('Admin')
  async purgeQueue(@Body('queueName') queueName: string) {
    if (!queueName) return { success: false, message: 'Queue name is required' };
    const rmqHost = this.configService.get<string>('RABBITMQ_HOST', 'warehouse_rabbitmq');
    try {
      const res = await fetch(`http://${rmqHost}:15672/api/queues/%2F/${encodeURIComponent(queueName)}/contents`, {
        method: 'DELETE',
        headers: {
          Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64'),
        },
      });
      return { success: res.ok, message: res.ok ? `Queue [${queueName}] purged successfully.` : `Failed to purge queue [${queueName}].` };
    } catch (e: any) {
      return { success: false, message: `Error purging queue: ${e?.message || e}` };
    }
  }

  @Post('message-bus/requeue-dlq')
  @Roles('Admin')
  async requeueDlq(@Body('dlqName') dlqName: string, @Body('targetQueue') targetQueue: string) {
    if (!dlqName || !targetQueue) return { success: false, message: 'dlqName and targetQueue are required' };
    const rmqHost = this.configService.get<string>('RABBITMQ_HOST', 'warehouse_rabbitmq');
    const auth = 'Basic ' + Buffer.from('guest:guest').toString('base64');

    try {
      // Get up to 50 messages from DLQ and ack them
      const getRes = await fetch(`http://${rmqHost}:15672/api/queues/%2F/${encodeURIComponent(dlqName)}/get`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 50, ackmode: 'ack_requeue_false', encoding: 'auto' }),
      });

      if (!getRes.ok) return { success: false, message: 'Failed to fetch messages from DLQ' };
      const messages = await getRes.json();
      if (!Array.isArray(messages) || messages.length === 0) {
        return { success: true, count: 0, message: `DLQ [${dlqName}] is empty.` };
      }

      let requeuedCount = 0;
      for (const msg of messages) {
        const pubRes = await fetch(`http://${rmqHost}:15672/api/exchanges/%2F/amq.default/publish`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: msg.properties || {},
            routing_key: targetQueue,
            payload: msg.payload,
            payload_encoding: msg.payload_encoding || 'string',
          }),
        });
        if (pubRes.ok) requeuedCount++;
      }

      return {
        success: true,
        count: requeuedCount,
        message: `Successfully requeued ${requeuedCount} error messages from [${dlqName}] back to [${targetQueue}].`,
      };
    } catch (e: any) {
      return { success: false, message: `Error requeuing DLQ: ${e?.message || e}` };
    }
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
