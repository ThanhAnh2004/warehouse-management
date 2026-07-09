import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject('IDENTITY_SERVICE') private readonly identityClient: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid token');
    }

    const token = authHeader.split(' ')[1];

    try {
      // Gửi token sang Identity Service để xác thực qua TCP
      const result = await firstValueFrom(
        this.identityClient.send('auth.verify', { token })
      );

      if (!result.success) {
        throw new UnauthorizedException(result.message || 'Unauthorized');
      }

      // Gán thông tin user vào request để các controller có thể sử dụng
      request.user = result.data;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
