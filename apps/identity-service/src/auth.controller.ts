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

  @MessagePattern('auth.refresh')
  handleRefresh(@Payload() data: { refreshToken: string }) {
    return this.authService.refresh(data);
  }

  @MessagePattern('auth.logout')
  handleLogout(@Payload() data: { userId?: string, refreshToken?: string }) {
    return this.authService.logout(data);
  }

  @MessagePattern('auth.change_password')
  handleChangePassword(@Payload() data: any) {
    return this.authService.changePassword(data);
  }
}
