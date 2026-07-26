import { NestFactory } from '@nestjs/core';
import { InventoryServiceModule } from './inventory-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const isRmq = process.env.MICROSERVICE_TRANSPORT === 'rmq';

  if (isRmq) {
    const rmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(InventoryServiceModule, {
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: 'inventory_queue',
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
    });
    await app.listen();
    console.log(`Inventory Microservice is listening on RabbitMQ queue [inventory_queue] (${rmqUrl})`);
  } else {
    const host = process.env.INVENTORY_SERVICE_HOST || 'localhost';
    const port = parseInt(process.env.INVENTORY_SERVICE_PORT || '8002', 10);
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(InventoryServiceModule, {
      transport: Transport.TCP,
      options: { host, port },
    });
    await app.listen();
    console.log(`Inventory Microservice is listening on TCP ${host}:${port}`);
  }
}
bootstrap();
