import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const isRmq = process.env.MICROSERVICE_TRANSPORT === 'rmq';

  if (isRmq) {
    const rmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationServiceModule, {
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: 'notification_queue',
        queueOptions: {
          durable: true,
          deadLetterExchange: 'amq.direct',
          deadLetterRoutingKey: 'notification_dlq',
        },
        socketOptions: {
          heartbeatIntervalInSeconds: 5,
          reconnectTimeInSeconds: 5,
        },
      },
    });
    await app.listen();
    console.log(`Notification Microservice is listening on RabbitMQ queue [notification_queue] (${rmqUrl})`);
  } else {
    const host = process.env.NOTIFICATION_SERVICE_HOST || 'localhost';
    const port = parseInt(process.env.NOTIFICATION_SERVICE_PORT || '3004', 10);
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationServiceModule, {
      transport: Transport.TCP,
      options: { host, port },
    });
    await app.listen();
    console.log(`Notification Microservice is listening on TCP ${host}:${port}`);
  }
}
bootstrap();
