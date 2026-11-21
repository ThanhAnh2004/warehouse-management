import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ProcurementServiceModule } from './procurement-service.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('SupplierService');
  const appContext = await NestFactory.createApplicationContext(ProcurementServiceModule);
  const configService = appContext.get(ConfigService);

  const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
  const rmqUrl = configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');
  const host = configService.get<string>('SUPPLIER_SERVICE_HOST', configService.get<string>('PROCUREMENT_SERVICE_HOST', '0.0.0.0'));
  const port = configService.get<number>('SUPPLIER_SERVICE_PORT', configService.get<number>('PROCUREMENT_SERVICE_PORT', 8007));

  await appContext.close();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ProcurementServiceModule,
    isRmq
      ? {
          transport: Transport.RMQ,
          options: {
            urls: [rmqUrl],
            queue: 'procurement_queue',
            queueOptions: {
              durable: true,
              deadLetterExchange: 'amq.direct',
              deadLetterRoutingKey: 'procurement_dlq',
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
            host,
            port,
          },
        },
  );

  await app.listen();
  logger.log(`Supplier Service is listening via ${isRmq ? 'RabbitMQ (procurement_queue)' : `TCP on port ${port}`}`);
}

bootstrap();
