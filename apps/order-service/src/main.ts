import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { OrderServiceModule } from './order-service.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('OrderService');
  const appContext = await NestFactory.createApplicationContext(OrderServiceModule);
  const configService = appContext.get(ConfigService);

  const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';
  const rmqUrl = configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');
  const host = configService.get<string>('ORDER_SERVICE_HOST', '0.0.0.0');
  const port = configService.get<number>('ORDER_SERVICE_PORT', 8006);

  await appContext.close();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    OrderServiceModule,
    isRmq
      ? {
          transport: Transport.RMQ,
          options: {
            urls: [rmqUrl],
            queue: 'order_queue',
            queueOptions: {
              durable: true,
              deadLetterExchange: 'amq.direct',
              deadLetterRoutingKey: 'order_dlq',
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
  logger.log(`Order & Fulfillment Service is listening via ${isRmq ? 'RabbitMQ (order_queue)' : `TCP on port ${port}`}`);
}

bootstrap();
