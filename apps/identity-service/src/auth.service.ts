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
