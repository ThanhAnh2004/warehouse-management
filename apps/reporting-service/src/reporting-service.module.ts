import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ReportingServiceController } from './reporting-service.controller';
import { ReportingServiceService } from './reporting-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      {
        name: 'INVENTORY_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
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
                  host: configService.get<string>('INVENTORY_SERVICE_HOST', '127.0.0.1'),
                  port: configService.get<number>('INVENTORY_SERVICE_PORT', 8002),
                },
              };
        },
      },
      {
        name: 'TRANSACTION_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
          return isRmq
            ? {
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
                  queue: 'transaction_queue',
                  queueOptions: { durable: true, deadLetterExchange: 'amq.direct', deadLetterRoutingKey: 'transaction_dlq' },
                  socketOptions: { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 },
                },
              }
            : {
                transport: Transport.TCP,
                options: {
                  host: configService.get<string>('TRANSACTION_SERVICE_HOST', '127.0.0.1'),
                  port: configService.get<number>('TRANSACTION_SERVICE_PORT', 8003),
                },
              };
        },
      },
    ]),
  ],
  controllers: [ReportingServiceController],
  providers: [ReportingServiceService],
})
export class ReportingServiceModule {}
