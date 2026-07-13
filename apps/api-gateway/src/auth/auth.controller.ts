import { Controller, Post, Body, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
}
