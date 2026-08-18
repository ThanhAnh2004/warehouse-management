import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject('IDENTITY_SERVICE') private readonly identityClient: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu mã xác thực hoặc phiên đăng nhập không hợp lệ');
    }

    const token = authHeader.split(' ')[1];

    try {
      // Gửi token sang Identity Service để xác thực qua TCP (timeout 3s nếu service tạm ngưng)
      const result = await firstValueFrom(
        this.identityClient.send('auth.verify', { token }).pipe(timeout(3000))
      );

      if (!result || !result.success) {
        throw new UnauthorizedException(result?.message || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }

      // Gán thông tin user vào request để các controller có thể sử dụng
      request.user = result.data;
      return true;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Nếu lỗi mất kết nối microservice hoặc message bus, trả về 503 thay vì 401 để không bị logout nhầm
      throw new ServiceUnavailableException('Hệ thống tạm thời mất kết nối. Đang tự động kết nối lại...');
    }
  }
}
