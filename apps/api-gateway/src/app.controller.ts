import { Controller, Get, Inject, UseGuards, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from './auth/auth.guard';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    // Inject ClientProxy của IDENTITY_SERVICE mà ta đã đăng ký trong module
    @Inject('IDENTITY_SERVICE') private readonly client: ClientProxy,
  ) {}

  @Get()
  getHello() {
    // Gửi tin nhắn TCP với pattern 'hello-identity' và dữ liệu là trống '{}'
    return this.client.send('hello-identity', {});
  }

  // API yêu cầu xác thực JWT mới xem được
  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return {
      message: 'This is protected data!',
      user: req.user, // Thông tin user được gán từ AuthGuard
    };
  }
}
