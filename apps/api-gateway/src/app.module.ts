import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthController } from './auth/auth.controller';
import { UsersController } from './users.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InventoryController } from './inventory/inventory.controller';
import { TransactionsController } from './transactions/transactions.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { ReportsController } from './reports/reports.controller';
import { AdminController } from './admin/admin.controller';
import { SystemController } from './system/system.controller';
import { OrdersController } from './orders/orders.controller';
import { ProcurementController } from './procurement/procurement.controller';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        // Use in-memory cache
      }),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      {
        name: 'IDENTITY_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => {
          const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
          return isRmq
            ? {
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
                  queue: 'identity_queue',
                  queueOptions: { durable: true, deadLetterExchange: 'amq.direct', deadLetterRoutingKey: 'identity_dlq' },
                  socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 },
                },
              }
            : {
                transport: Transport.TCP,
                options: {
                  host: configService.get<string>('IDENTITY_SERVICE_HOST', 'localhost'),
                  port: configService.get<number>('IDENTITY_SERVICE_PORT', 8001),
                },
              };
        },
        inject: [ConfigService],
      },
      {
        name: 'INVENTORY_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => {
          const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
          return isRmq
            ? {
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
                  queue: 'inventory_queue',
                  queueOptions: { durable: true, deadLetterExchange: 'amq.direct', deadLetterRoutingKey: 'inventory_dlq' },
                  socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 },
                },
              }
            : {
                transport: Transport.TCP,
                options: {
                  host: configService.get<string>('INVENTORY_SERVICE_HOST', 'localhost'),
                  port: configService.get<number>('INVENTORY_SERVICE_PORT', 8002),
                },
              };
        },
        inject: [ConfigService],
      },
      {
        name: 'NOTIFICATION_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => {
          const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
          return isRmq
            ? {
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
                  queue: 'notification_queue',
                  queueOptions: { durable: true, deadLetterExchange: 'amq.direct', deadLetterRoutingKey: 'notification_dlq' },
                  socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 },
                },
              }
            : {
                transport: Transport.TCP,
                options: {
                  host: configService.get<string>('NOTIFICATION_SERVICE_HOST', 'localhost'),
                  port: configService.get<number>('NOTIFICATION_SERVICE_PORT', 3004),
                },
              };
        },
        inject: [ConfigService],
      },
      {
        name: 'REPORTING_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => {
          const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
          return isRmq
            ? {
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
                  queue: 'inventory_queue',
                  queueOptions: { durable: true, deadLetterExchange: 'amq.direct', deadLetterRoutingKey: 'inventory_dlq' },
                  socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 },
                },
              }
            : {
                transport: Transport.TCP,
                options: {
                  host: configService.get<string>('INVENTORY_SERVICE_HOST', 'localhost'),
                  port: configService.get<number>('INVENTORY_SERVICE_PORT', 8002),
                },
              };
        },
        inject: [ConfigService],
      },
      {
        name: 'ORDER_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => {
          const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
          return isRmq
            ? {
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
                  queue: 'order_queue',
                  queueOptions: { durable: true, deadLetterExchange: 'amq.direct', deadLetterRoutingKey: 'order_dlq' },
                  socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 },
                },
              }
            : {
                transport: Transport.TCP,
                options: {
                  host: configService.get<string>('ORDER_SERVICE_HOST', 'localhost'),
                  port: configService.get<number>('ORDER_SERVICE_PORT', 8006),
                },
              };
        },
        inject: [ConfigService],
      },
      {
        name: 'PROCUREMENT_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => {
          const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
          return isRmq
            ? {
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
                  queue: 'procurement_queue',
                  queueOptions: { durable: true, deadLetterExchange: 'amq.direct', deadLetterRoutingKey: 'procurement_dlq' },
                  socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 },
                },
              }
            : {
                transport: Transport.TCP,
                options: {
                  host: configService.get<string>('SUPPLIER_SERVICE_HOST', configService.get<string>('PROCUREMENT_SERVICE_HOST', 'localhost')),
                  port: configService.get<number>('SUPPLIER_SERVICE_PORT', configService.get<number>('PROCUREMENT_SERVICE_PORT', 8007)),
                },
              };
        },
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [
    AppController,
    AuthController,
    UsersController,
    InventoryController,
    TransactionsController,
    NotificationsController,
    ReportsController,
    AdminController,
    SystemController,
    OrdersController,
    ProcurementController,
  ],
  providers: [AppService],
})
export class AppModule {}
