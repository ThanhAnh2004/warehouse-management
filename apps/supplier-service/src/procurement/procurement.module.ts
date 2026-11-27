import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Supplier } from './entities/supplier.entity';
import { SupplierProduct } from './entities/supplier-product.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { ProcurementService } from './procurement.service';
import { ProcurementController } from './procurement.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      SupplierProduct,
      PurchaseOrder,
      PurchaseOrderItem,
    ]),
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
                  urls: [
                    configService.get<string>(
                      'RABBITMQ_URL',
                      configService.get<string>('RABBITMQ_URI', 'amqp://localhost:5672'),
                    ),
                  ],
                  queue: configService.get<string>('RABBITMQ_INVENTORY_QUEUE', 'inventory_queue'),
                  queueOptions: {
                    durable: true,
                    deadLetterExchange: 'amq.direct',
                    deadLetterRoutingKey: 'inventory_dlq',
                  },
                  socketOptions: {
                    heartbeatIntervalInSeconds: 5,
                    reconnectTimeInSeconds: 5,
                  },
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
      },
    ]),
  ],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
