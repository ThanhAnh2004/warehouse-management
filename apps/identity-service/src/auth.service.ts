import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users/users.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    // Tiêm UsersService từ UsersModule để thao tác với User dữ liệu
    private readonly usersService: UsersService,
  ) {}

  async register(data: any) {
    const { username, password, fullName, role } = data;
    
    // Kiểm tra xem user đã tồn tại chưa qua UsersService
    const existingUser = await this.usersService.findOneByUsername(username);
    if (existingUser) {
      return { success: false, message: 'Username already exists' };
    }

    // Hash mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Tạo user mới qua UsersService
    const newUser = await this.usersService.create({
      username,
      password: hashedPassword,
      fullName,
      role: role || 'Staff', // Mặc định là Staff nếu không truyền
    });

    return { success: true, message: 'User registered successfully', userId: newUser.id };
  }

  async login(data: any) {
    const { username, password } = data;
    
    // Tìm user qua UsersService
    const user = await this.usersService.findOneByUsername(username);
    if (!user) {
      return { success: false, message: 'Invalid credentials' };
    }

    // Kiểm tra mật khẩu
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return { success: false, message: 'Invalid credentials' };
    }

    // Tạo JWT token đính kèm role
    const payload = { username: user.username, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return { success: true, token };
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
}
