import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { RpcExceptionToHttpFilter } from './common/filters/rpc-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Bật CORS cho phép Web kết nối
  app.enableCors();

  // Bật ValidationPipe toàn cục để tự động kiểm tra DTO
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Tự động loại bỏ các field không có trong DTO
    forbidNonWhitelisted: true, // Báo lỗi nếu gửi field rác
  }));

  // Đăng ký bộ lọc lỗi RPC toàn cục
  app.useGlobalFilters(new RpcExceptionToHttpFilter());

  // Lấy ConfigService để truy cập vào biến môi trường
  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_GATEWAY_PORT', 8000);

  // Cấu hình Swagger
  const config = new DocumentBuilder()
    .setTitle('Warehouse Management API')
    .setDescription('Tài liệu API cho Hệ thống Quản lý Kho Hàng (Microservices)')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-auth', // Tên của security scheme
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(port);
  console.log(`API Gateway is running on: http://localhost:${port}`);
}
bootstrap();
