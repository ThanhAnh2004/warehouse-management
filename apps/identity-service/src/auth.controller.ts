import { Controller } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern('auth.register')
  handleRegister(@Payload() data: any) {
    return this.authService.register(data);
  }

  @MessagePattern('auth.login')
  handleLogin(@Payload() data: any) {
    return this.authService.login(data);
  }

  @MessagePattern('auth.verify')
  handleVerifyToken(@Payload() data: { token: string }) {
    return this.authService.verifyToken(data);
  }
}
