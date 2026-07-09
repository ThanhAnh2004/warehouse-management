import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { RpcExceptionToHttpFilter } from './common/filters/rpc-exception.filter';

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

  await app.listen(port);
  console.log(`API Gateway is running on: http://localhost:${port}`);
}
bootstrap();
