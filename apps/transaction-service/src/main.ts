import { NestFactory } from '@nestjs/core';
import { TransactionServiceModule } from './transaction-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(TransactionServiceModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('TRANSACTION_SERVICE_PORT') || 8003;

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: 'localhost',
      port: port,
    },
  });

  await app.startAllMicroservices();
  console.log(`Transaction Microservice is listening on TCP localhost:${port}`);
}
bootstrap();
