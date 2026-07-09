import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as dotenv from 'dotenv';

// Tải các biến môi trường từ file .env ở thư mục gốc vào process.env trước
dotenv.config();

async function bootstrap() {
  const host = process.env.IDENTITY_SERVICE_HOST || 'localhost';
  const port = parseInt(process.env.IDENTITY_SERVICE_PORT || '8001', 10);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    {
      transport: Transport.TCP,
      options: {
        host,
        port,
      },
    },
  );
  await app.listen();
  console.log(`Identity Microservice is listening on ${host}:${port}`);
}
bootstrap();