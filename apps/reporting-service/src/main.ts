import { NestFactory } from '@nestjs/core';
import { ReportingServiceModule } from './reporting-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const isRmq = process.env.MICROSERVICE_TRANSPORT === 'rmq';

  if (isRmq) {
    const rmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(ReportingServiceModule, {
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: 'reporting_queue',
        queueOptions: {
          durable: true,
          deadLetterExchange: 'amq.direct',
          deadLetterRoutingKey: 'reporting_dlq',
        },
        socketOptions: {
          heartbeatIntervalInSeconds: 5,
          reconnectTimeInSeconds: 5,
        },
      },
    });
    await app.listen();
    console.log(`Reporting Microservice is listening on RabbitMQ queue [reporting_queue] (${rmqUrl})`);
  } else {
    const host = process.env.REPORTING_SERVICE_HOST || 'localhost';
    const port = parseInt(process.env.REPORTING_SERVICE_PORT || '3005', 10);
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(ReportingServiceModule, {
      transport: Transport.TCP,
      options: { host, port },
    });
    await app.listen();
    console.log(`Reporting Microservice is listening on TCP ${host}:${port}`);
  }
}
bootstrap();
