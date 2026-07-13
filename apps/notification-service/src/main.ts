import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationServiceModule, {
    transport: Transport.TCP,
    options: {
      host: '127.0.0.1',
      port: 3004,
    },
  });

  await app.listen();
  console.log(`Notification Microservice is listening on TCP port 3004`);
}
bootstrap();
