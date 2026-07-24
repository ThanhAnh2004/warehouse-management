import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { TransactionServiceModule } from './transaction-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(TransactionServiceModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('TRANSACTION_SERVICE_PORT') || 8003;

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const isRmq = configService.get<string>('MICROSERVICE_TRANSPORT') === 'rmq';

  if (isRmq) {
    const rmqUrl = configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672';
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: 'transaction_queue',
        queueOptions: {
          durable: true,
          deadLetterExchange: 'amq.direct',
          deadLetterRoutingKey: 'transaction_dlq',
        },
        socketOptions: {
          heartbeatIntervalInSeconds: 5,
          reconnectTimeInSeconds: 5,
        },
      },
    });
    console.log(`Transaction Microservice is listening on RabbitMQ queue [transaction_queue] (${rmqUrl})`);
  } else {
    const host = configService.get<string>('TRANSACTION_SERVICE_HOST') || 'localhost';
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host, port },
    });
    console.log(`Transaction Microservice is listening on TCP ${host}:${port}`);
  }

  await app.startAllMicroservices();
}
bootstrap();
