import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as dotenv from 'dotenv';

// Tải các biến môi trường từ file .env ở thư mục gốc vào process.env trước
dotenv.config();

async function bootstrap() {
  const rmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: 'identity_queue',
        queueOptions: {
          durable: true,
        },
      },
    },
  );
  await app.listen();
  console.log(`Identity Microservice is listening on RabbitMQ queue [identity_queue] (${rmqUrl})`);
}
bootstrap();