import { NestFactory } from '@nestjs/core';
import { ReportingServiceModule } from './reporting-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const rmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ReportingServiceModule, {
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: 'reporting_queue',
      queueOptions: {
        durable: true,
      },
    },
  });
  await app.listen();
  console.log(`Reporting Microservice is listening on RabbitMQ queue [reporting_queue] (${rmqUrl})`);
}
bootstrap();
