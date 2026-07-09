import { NestFactory } from '@nestjs/core';
import { InventoryServiceModule } from './inventory-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const host = process.env.INVENTORY_SERVICE_HOST || 'localhost';
  const port = parseInt(process.env.INVENTORY_SERVICE_PORT || '8002', 10);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    InventoryServiceModule,
    {
      transport: Transport.TCP,
      options: {
        host,
        port,
      },
    },
  );
  await app.listen();
  console.log(`Inventory Microservice is listening on TCP ${host}:${port}`);
}
bootstrap();
