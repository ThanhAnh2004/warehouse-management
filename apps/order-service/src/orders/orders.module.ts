import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PickList } from './entities/pick-list.entity';
import { PickListItem } from './entities/pick-list-item.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, PickList, PickListItem]),
    ClientsModule.registerAsync([
      {
        name: 'INVENTORY_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
          return isRmq
            ? {
                transport: Transport.RMQ,
                options: {
                  urls: [configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
                  queue: 'inventory_queue',
                  queueOptions: { durable: true, deadLetterExchange: 'amq.direct', deadLetterRoutingKey: 'inventory_dlq' },
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
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
