import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from './auth/auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RequirePermissions } from './common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

import { UpdateUserDto } from './auth/dto/update-user.dto';

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

  @RequirePermissions('users:delete')
  @Get('roles')
  async getRoles() {
    return await firstValueFrom(this.identityClient.send('roles.findAll', {}));
  }

  @RequirePermissions('users:delete')
  @Patch('roles/:name')
  async updateRole(@Param('name') name: string, @Body() body: { permissions?: string[]; description?: string }) {
    return await firstValueFrom(
      this.identityClient.send('roles.update', { name, updateData: body })
    );
  }

  @RequirePermissions('users:delete')
  @Post('roles')
  async createRole(@Body() body: { name: string; description?: string }) {
    return await firstValueFrom(this.identityClient.send('roles.create', body));
  }

  @RequirePermissions('users:delete')
  @Delete('roles/:name')
  async deleteRole(@Param('name') name: string) {
    return await firstValueFrom(this.identityClient.send('roles.delete', { name }));
  }

  @RequirePermissions('users:delete')
  @Get('permissions')
  async getPermissions() {
    return await firstValueFrom(this.identityClient.send('permissions.findAll', {}));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await firstValueFrom(this.identityClient.send('users.findOne', { id }));
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('avatar', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = join(__dirname, '..', '..', 'public', 'uploads', 'avatars');
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
    @UploadedFile() file?: Express.Multer.File
  ) {
    const payload = { ...updateData };
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
