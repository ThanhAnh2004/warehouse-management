import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Inject, UseGuards, UseInterceptors, UploadedFile, Request, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from './auth/auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RequirePermissions, RequireAnyPermissions } from './common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

const buildCleanFilename = (originalname: string, defaultPrefix = 'avatar') => {
  const ext = extname(originalname).toLowerCase();
  const nameWithoutExt = originalname.substring(0, originalname.lastIndexOf('.')) || originalname;
  const cleanName = nameWithoutExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const finalName = cleanName || defaultPrefix;
  const random6 = Math.floor(100000 + Math.random() * 900000).toString();
  return `${finalName}_${random6}${ext}`;
};

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(AuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    @Inject('IDENTITY_SERVICE') private readonly identityClient: ClientProxy,
  ) {}

  @RequirePermissions('users:read')
  @Get()
  async findAll() {
    return await firstValueFrom(this.identityClient.send('users.findAll', {}));
  }

  private isCallerRootAdmin(req: any): boolean {
    return Boolean(req.user?.isSystemAdmin) || /^(admin|quản trị viên)$/i.test((req.user?.role || '').trim());
  }

  private async isProtectedAdminRole(roleName?: string): Promise<boolean> {
    if (!roleName) return false;
    if (/^(admin|quản trị viên)$/i.test(roleName.trim())) return true;
    try {
      const roles: any[] = await firstValueFrom(this.identityClient.send('roles.findAll', {}));
      const matched = Array.isArray(roles) ? roles.find((r) => r.name === roleName) : null;
      return Boolean(matched?.isSystemAdmin);
    } catch {
      return false;
    }
  }

  @RequirePermissions('users:create')
  @Post()
  async create(@Body() body: any, @Request() req) {
    if (!body?.password || String(body.password).length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự.');
    }
    if (!this.isCallerRootAdmin(req) && (await this.isProtectedAdminRole(body?.role))) {
      throw new ForbiddenException('Chỉ Quản trị viên hệ thống mới được phép tạo tài khoản thuộc vai trò quản trị tối cao.');
    }
    return await firstValueFrom(this.identityClient.send('auth.register', body));
  }

  @RequireAnyPermissions('roles:read', 'roles:manage', 'users:read', 'users:create', 'users:update')
  @Get('roles')
  async getRoles() {
    return await firstValueFrom(this.identityClient.send('roles.findAll', {}));
  }

  @RequirePermissions('roles:manage')
  @Patch('roles/:name')
  async updateRole(@Param('name') name: string, @Body() body: { newName?: string; permissions?: string[]; description?: string }) {
    const res = await firstValueFrom(
      this.identityClient.send('roles.update', { name, updateData: body })
    );
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Cập nhật vai trò thất bại.');
    }
    return res;
  }

  @RequirePermissions('roles:manage')
  @Post('roles')
  async createRole(@Body() body: { name: string; description?: string; permissions?: string[] }) {
    const res = await firstValueFrom(this.identityClient.send('roles.create', body));
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Tạo vai trò mới thất bại.');
    }
    return res?.data || res;
  }

  @RequirePermissions('roles:manage')
  @Delete('roles/:name')
  async deleteRole(@Param('name') name: string, @Query('reassignTo') reassignTo?: string) {
    const res = await firstValueFrom(this.identityClient.send('roles.delete', { name, reassignTo }));
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Xóa vai trò thất bại.');
    }
    return res;
  }

  @RequireAnyPermissions('roles:read', 'roles:manage', 'users:read', 'users:update')
  @Get('permissions')
  async getPermissions() {
    return await firstValueFrom(this.identityClient.send('permissions.findAll', {}));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const isSelf = req.user?.sub === id;
    const isAdmin = this.isCallerRootAdmin(req);
    const canReadUsers = Array.isArray(req.user?.permissions) && req.user.permissions.includes('users:read');
    if (!isSelf && !isAdmin && !canReadUsers) {
      throw new ForbiddenException('Access denied. Cannot view other user profiles.');
    }
    try {
      const res = await firstValueFrom(this.identityClient.send('users.findOne', { id }));
      return res || { success: false, message: 'User not found' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error fetching user profile' };
    }
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('avatar', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = join(process.cwd(), 'public', 'uploads', 'avatars');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        cb(null, buildCleanFilename(file.originalname, 'avatar'));
      }
    })
  }))
  async update(
    @Param('id') id: string,
    @Body() updateData: any,
    @Request() req,
    @UploadedFile() file?: Express.Multer.File
  ) {
    const isSelf = req.user?.sub === id;
    const isAdmin = this.isCallerRootAdmin(req);
    const perms = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
    const canUpdateUsers = perms.includes('users:update');
    const canManageRoles = perms.includes('roles:manage');

    if (!isSelf && !isAdmin && !canUpdateUsers) {
      throw new ForbiddenException('Access denied. Missing required permission: users:update');
    }

    const payload = { ...updateData };
    if (!isAdmin) {
      // Prevent privilege escalation or self role change
      if (isSelf && !canUpdateUsers) {
        delete payload.role;
      }
      if (await this.isProtectedAdminRole(payload.role)) {
        throw new ForbiddenException('Không thể gán vai trò Quản trị viên hệ thống.');
      }
      if (!canManageRoles) {
        delete payload.permissions;
      }
    }

    if (file) {
      payload.avatarUrl = `/uploads/avatars/${file.filename}`;
    }
    return await firstValueFrom(this.identityClient.send('users.update', { id, updateData: payload }));
  }

  @RequirePermissions('users:delete')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await firstValueFrom(this.identityClient.send('users.remove', { id }));
  }
}
