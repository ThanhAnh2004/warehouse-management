import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { Transaction } from './entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
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
                  host: configService.get<string>('INVENTORY_SERVICE_HOST') || 'localhost',
                  port: configService.get<number>('INVENTORY_SERVICE_PORT') || 8002,
                },
              };
        },
      },
    ]),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
