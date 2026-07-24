import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const rmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationServiceModule, {
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: 'notification_queue',
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.listen();
  console.log(`Notification Microservice is listening on RabbitMQ queue [notification_queue] (${rmqUrl})`);
}
bootstrap();
