import { Controller, Get, Patch, Delete, Body, Param, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from './auth/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { Roles } from './common/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(AuthGuard, RolesGuard) // Bảo mật bằng AuthGuard (kiểm tra JWT) và RolesGuard (kiểm tra quyền)
export class UsersController {
  constructor(
    @Inject('IDENTITY_SERVICE') private readonly identityClient: ClientProxy,
  ) {}

  @Roles('Admin') // Chỉ Admin mới được xem danh sách tất cả user
  @Get()
  async findAll() {
    return await firstValueFrom(this.identityClient.send('users.findAll', {}));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await firstValueFrom(this.identityClient.send('users.findOne', { id }));
  }

  @Roles('Admin') // Chỉ Admin mới được cập nhật vai trò/thông tin user khác
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateData: any) {
    return await firstValueFrom(this.identityClient.send('users.update', { id, updateData }));
  }

  @Roles('Admin') // Chỉ Admin mới được xóa user
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await firstValueFrom(this.identityClient.send('users.remove', { id }));
  }
}
