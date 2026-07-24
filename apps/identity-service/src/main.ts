import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as dotenv from 'dotenv';

// Tải các biến môi trường từ file .env ở thư mục gốc vào process.env trước
dotenv.config();

async function bootstrap() {
  const isRmq = process.env.MICROSERVICE_TRANSPORT === 'rmq';

  if (isRmq) {
    const rmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: 'identity_queue',
        queueOptions: {
          durable: true,
          deadLetterExchange: 'amq.direct',
          deadLetterRoutingKey: 'identity_dlq',
        },
        socketOptions: {
          heartbeatIntervalInSeconds: 5,
          reconnectTimeInSeconds: 5,
        },
      },
    });
    await app.listen();
    console.log(`Identity Microservice is listening on RabbitMQ queue [identity_queue] (${rmqUrl})`);
  } else {
    const host = process.env.IDENTITY_SERVICE_HOST || 'localhost';
    const port = parseInt(process.env.IDENTITY_SERVICE_PORT || '8001', 10);
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
      transport: Transport.TCP,
      options: { host, port },
    });
    await app.listen();
    console.log(`Identity Microservice is listening on TCP ${host}:${port}`);
  }
}
bootstrap();