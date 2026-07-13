import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // Tạo người dùng mới
  async create(user: any) {
    const createdUser = new this.userModel(user);
    return await createdUser.save();
  }

  // Lấy toàn bộ người dùng
  async findAll() {
    // Trả về danh sách user và loại bỏ password vì lý do bảo mật
    return await this.userModel.find().select('-password').exec();
  }

  // Tìm một người dùng theo Email (phục vụ Auth)
  async findOneByEmail(email: string) {
    return await this.userModel.findOne({ email }).exec();
  }

  // Tìm một người dùng theo ID
  async findOne(id: string) {
    return await this.userModel.findById(id).select('-password').exec();
  }

  // Tìm một người dùng theo ID kèm mật khẩu
  async findOneWithPassword(id: string) {
    return await this.userModel.findById(id).exec();
  }

  // Cập nhật thông tin người dùng
  async update(id: string, updateData: any) {
    // Loại bỏ không cho sửa email và password qua hàm này
    const { email: _, password: __, ...allowedUpdates } = updateData;
    
    const updatedUser = await this.userModel.findByIdAndUpdate(
      id,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    ).select('-password').exec();

    if (!updatedUser) {
      return { success: false, message: 'User not found' };
    }
    
    return { success: true, data: updatedUser };
  }

  // Xóa người dùng
  async remove(id: string) {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      return { success: false, message: 'User not found' };
    }
    return { success: true, message: 'User deleted successfully' };
  }

  // Update refresh token
  async updateRefreshToken(id: string, refreshToken: string | null) {
    return await this.userModel.findByIdAndUpdate(id, { refreshToken }, { new: true }).exec();
  }

  // Find user by refresh token
  async findOneByRefreshToken(refreshToken: string) {
    return await this.userModel.findOne({ refreshToken }).exec();
  }
}
