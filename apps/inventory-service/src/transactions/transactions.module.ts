import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { Transaction } from './entities/transaction.entity';
import { SagaInstance } from './entities/saga-instance.entity';
import { Inventory } from '../stock/entities/inventory.entity';
import { Product } from '../products/entities/product.entity';
import { Location } from '../stock/entities/location.entity';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, SagaInstance, Inventory, Product, Location]),
    ClientsModule.registerAsync([
      {
        name: 'NOTIFICATION_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
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
      },
    ]),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
