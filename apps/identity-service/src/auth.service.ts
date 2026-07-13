import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users/users.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async register(data: any) {
    const { email, password, fullname, role, address, phone, gender } = data;
    
    // Kiểm tra xem user đã tồn tại chưa qua UsersService
    const existingUser = await this.usersService.findOneByEmail(email);
    if (existingUser) {
      return { success: false, message: 'Email already exists' };
    }

    // Hash mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Tạo user mới qua UsersService
    const newUser = await this.usersService.create({
      email,
      password: hashedPassword,
      fullname,
      role: role || 'Staff', // Mặc định là Staff nếu không truyền
      address,
      phone,
      gender,
      createdBy: 'system',
      updatedBy: 'system'
    });

    return { success: true, message: 'User registered successfully', userId: newUser.id };
  }

  async login(data: any) {
    const { email, password } = data;
    
    // Tìm user qua UsersService
    const user = await this.usersService.findOneByEmail(email);
    if (!user) {
      return { success: false, message: 'Invalid credentials' };
    }

    // Kiểm tra mật khẩu
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return { success: false, message: 'Invalid credentials' };
    }

    // Tạo JWT token đính kèm role
    const payload = { 
      email: user.email, 
      sub: user.id, 
      role: user.role,
      fullname: user.fullname 
    };
    const token = this.jwtService.sign(payload);

    // Tạo refresh token
    const refreshToken = require('crypto').randomUUID();
    await this.usersService.updateRefreshToken(user.id, refreshToken);

    return { success: true, token, refreshToken };
  }

  async refresh(data: { refreshToken: string }) {
    if (!data.refreshToken) {
      return { success: false, message: 'Refresh token is required' };
    }

    const user = await this.usersService.findOneByRefreshToken(data.refreshToken);
    if (!user) {
      return { success: false, message: 'Invalid refresh token' };
    }

    // Tạo token mới
    const payload = { 
      email: user.email, 
      sub: user.id, 
      role: user.role,
      fullname: user.fullname 
    };
    const token = this.jwtService.sign(payload);

    return { success: true, token, refreshToken: data.refreshToken };
  }

  async logout(data: { userId?: string, refreshToken?: string }) {
    let user: any = null;
    if (data.userId) {
      user = await this.usersService.findOne(data.userId);
    } else if (data.refreshToken) {
      user = await this.usersService.findOneByRefreshToken(data.refreshToken);
    }

    if (user) {
      await this.usersService.updateRefreshToken(user.id, null);
    }

    return { success: true, message: 'Logged out successfully' };
  }

  verifyToken(data: { token: string }) {
    try {
      // Xác thực tính hợp lệ của token
      const decoded = this.jwtService.verify(data.token);
      return { success: true, data: decoded };
    } catch (error) {
      return { success: false, message: 'Invalid or expired token' };
    }
  }

  async changePassword(data: any) {
    const { userId, oldPassword, newPassword } = data;
    const user = await this.usersService.findOneWithPassword(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return { success: false, message: 'Invalid old password' };
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();

    return { success: true, message: 'Password changed successfully' };
  }
}
