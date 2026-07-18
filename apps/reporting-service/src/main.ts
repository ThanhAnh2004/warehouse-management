import { NestFactory } from '@nestjs/core';
import { ReportingServiceModule } from './reporting-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  // '127.0.0.1' chi nhan ket noi tu chinh container nay, khien cac container khac goi
  // sang qua Docker network bi ECONNREFUSED. Doc host tu env, giong pattern
  // transaction-service, de bind dung dia chi container khi chay Docker.
  const host = process.env.REPORTING_SERVICE_HOST || 'localhost';
  const port = parseInt(process.env.REPORTING_SERVICE_PORT || '3005', 10);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ReportingServiceModule, {
    transport: Transport.TCP,
    options: {
      host,
      port,
    },
  });
  await app.listen();
  console.log(`Reporting Microservice is listening on TCP ${host}:${port}`);
}
bootstrap();
