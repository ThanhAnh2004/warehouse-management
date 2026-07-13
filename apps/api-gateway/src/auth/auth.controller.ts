import { Controller, Post, Body, Inject, UseGuards, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthGuard } from './auth.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject('IDENTITY_SERVICE') private readonly identityClient: ClientProxy,
  ) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    // Nhờ ValidationPipe, 'body' ở đây chắc chắn đã hợp lệ
    return await firstValueFrom(this.identityClient.send('auth.register', body));
  }

  @Post('login')
  async login(@Body() body: LoginDto) {
    return await firstValueFrom(this.identityClient.send('auth.login', body));
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return await firstValueFrom(this.identityClient.send('auth.refresh', body));
  }

  @Post('logout')
  async logout(@Body() body: { userId?: string, refreshToken?: string }) {
    return await firstValueFrom(this.identityClient.send('auth.logout', body));
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(@Body() body: ChangePasswordDto, @Request() req) {
    const payload = {
      userId: req.user.sub || req.user.userId, // Sub is standard in jwt payload for userId
      oldPassword: body.oldPassword,
      newPassword: body.newPassword,
    };
    return await firstValueFrom(this.identityClient.send('auth.change_password', payload));
  }
}
