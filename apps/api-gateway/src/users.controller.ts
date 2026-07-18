import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from './auth/auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RequirePermissions } from './common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { UpdateUserDto } from './auth/dto/update-user.dto';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(AuthGuard, PermissionsGuard) // Bảo mật bằng AuthGuard (kiểm tra JWT) và PermissionsGuard
export class UsersController {
  constructor(
    @Inject('IDENTITY_SERVICE') private readonly identityClient: ClientProxy,
  ) {}

  @RequirePermissions('users:read') // Chỉ User có quyền users:read mới được xem danh sách tất cả user
  @Get()
  async findAll() {
    return await firstValueFrom(this.identityClient.send('users.findAll', {}));
  }

  @RequirePermissions('users:delete') // Chỉ Admin mới xem được danh sách vai trò
  @Get('roles')
  async getRoles() {
    return await firstValueFrom(this.identityClient.send('roles.findAll', {}));
  }

  @RequirePermissions('users:delete') // Admin can update role permissions/description
  @Patch('roles/:name')
  async updateRole(@Param('name') name: string, @Body() body: { permissions?: string[]; description?: string }) {
    return await firstValueFrom(
      this.identityClient.send('roles.update', { name, updateData: body })
    );
  }

  @RequirePermissions('users:delete') // Chỉ Admin mới tạo được vai trò mới
  @Post('roles')
  async createRole(@Body() body: { name: string; description?: string }) {
    return await firstValueFrom(this.identityClient.send('roles.create', body));
  }

  @RequirePermissions('users:delete') // Chỉ Admin mới xóa được vai trò
  @Delete('roles/:name')
  async deleteRole(@Param('name') name: string) {
    return await firstValueFrom(this.identityClient.send('roles.delete', { name }));
  }

  @RequirePermissions('users:delete') // Chỉ Admin mới lấy được danh sách quyền hệ thống
  @Get('permissions')
  async getPermissions() {
    return await firstValueFrom(this.identityClient.send('permissions.findAll', {}));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await firstValueFrom(this.identityClient.send('users.findOne', { id }));
  }

  @Roles('Admin') // Chỉ Admin mới được cập nhật vai trò/thông tin user khác
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateData: UpdateUserDto) {
    return await firstValueFrom(this.identityClient.send('users.update', { id, updateData }));
  }

  @RequirePermissions('users:delete') // Chỉ User có quyền users:delete mới được xóa user
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await firstValueFrom(this.identityClient.send('users.remove', { id }));
  }
}
