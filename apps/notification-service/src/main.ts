import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  // '127.0.0.1' chi nhan ket noi tu chinh container nay - cac container khac (vd
  // inventory-service) goi sang qua Docker network se bi ECONNREFUSED. Doc host tu env,
  // giong pattern transaction-service, de bind dung dia chi container khi chay Docker.
  const host = process.env.NOTIFICATION_SERVICE_HOST || 'localhost';
  const port = parseInt(process.env.NOTIFICATION_SERVICE_PORT || '3004', 10);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationServiceModule, {
    transport: Transport.TCP,
    options: {
      host,
      port,
    },
  });

  await app.listen();
  console.log(`Notification Microservice is listening on TCP ${host}:${port}`);
}
bootstrap();
