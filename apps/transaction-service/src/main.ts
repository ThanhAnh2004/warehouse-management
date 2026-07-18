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

  const host = configService.get<string>('TRANSACTION_SERVICE_HOST') || 'localhost';

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host,
      port,
    },
  });

  await app.startAllMicroservices();
  console.log(`Transaction Microservice is listening on TCP ${host}:${port}`);
}
bootstrap();
