import { NestFactory } from '@nestjs/core';
import { ReportingServiceModule } from './reporting-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ReportingServiceModule, {
    transport: Transport.TCP,
    options: {
      host: '127.0.0.1',
      port: 3005,
    },
  });
  await app.listen();
  console.log('Reporting Microservice is listening on TCP port 3005');
}
bootstrap();
