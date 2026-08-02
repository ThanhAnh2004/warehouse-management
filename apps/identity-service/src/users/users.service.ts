import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RpcException } from '@nestjs/microservices';
import { User, UserDocument } from './schemas/user.schema';
import { Role, RoleDocument } from './schemas/role.schema';
import { Permission, PermissionDocument } from './schemas/permission.schema';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(Permission.name) private permissionModel: Model<PermissionDocument>,
  ) {}

  async onModuleInit() {
    await this.seedPermissionsAndRoles();
  }

  async seedPermissionsAndRoles() {
    const defaultPermissions = [
      // 1. Quản lý Người dùng & Phân quyền (USERS)
      { key: 'users:read', name: 'Xem Danh Sách Tài Khoản', description: 'Xem danh sách tài khoản thành viên trong hệ thống' },
      { key: 'users:delete', name: 'Quản Lý & Xóa Tài Khoản', description: 'Tạo mới, phân quyền vai trò & xóa tài khoản người dùng' },

      // 2. Quản lý Sản phẩm (PRODUCTS)
      { key: 'products:read', name: 'Xem Danh Mục Sản Phẩm', description: 'Xem danh sách & chi tiết thông số sản phẩm' },
      { key: 'products:create', name: 'Thêm Sản Phẩm Mới', description: 'Thêm sản phẩm mới vào hệ thống danh mục điện máy' },
      { key: 'products:update', name: 'Cập Nhật Sản Phẩm', description: 'Chỉnh sửa thông tin, giá bán & hình ảnh sản phẩm' },
      { key: 'products:delete', name: 'Xóa Sản Phẩm Kho', description: 'Xóa sản phẩm khỏi danh mục hệ thống' },

      // 3. Quản lý Tồn Kho (STOCK)
      { key: 'stock:read', name: 'Xem Tồn Kho Thực Tế', description: 'Theo dõi số lượng tồn kho thời gian thực của các mặt hàng' },
      { key: 'stock:update', name: 'Cập Nhật Tồn Kho', description: 'Thay đổi trực tiếp số lượng tồn kho của sản phẩm' },

      // 4. Kiểm Kê & Điều Chỉnh (ADJUSTMENTS)
      { key: 'adjustments:read', name: 'Xem Báo Cáo Kiểm Kê', description: 'Xem lịch sử & chi tiết các phiếu kiểm kê điều chỉnh kho' },
      { key: 'adjustments:create', name: 'Tạo Báo Cáo Kiểm Kê', description: 'Lập phiếu kiểm kê & điều chỉnh số lượng tồn kho thực tế' },
      { key: 'adjustments:update', name: 'Sửa Báo Cáo Kiểm Kê', description: 'Chỉnh sửa thông tin báo cáo điều chỉnh kiểm kê' },
      { key: 'adjustments:delete', name: 'Xóa Báo Cáo Kiểm Kê', description: 'Xóa phiếu kiểm kê điều chỉnh khỏi hệ thống' },

      // 5. Giao Dịch Kho (TRANSACTIONS)
      { key: 'transactions:read', name: 'Xem Lịch Sử Giao Dịch', description: 'Xem nhật ký Nhập kho, Xuất kho, Điều chuyển kệ' },
      { key: 'transactions:create', name: 'Tạo Giao Dịch Kho Mới', description: 'Lập đơn Nhập kho, Xuất kho & Điều chuyển vị trí kệ kho' },

      // 6. Kệ Kho & Sơ Đồ Kho (LOCATIONS)
      { key: 'locations:read', name: 'Xem Sơ Đồ & Danh Mục Kệ', description: 'Xem mặt bằng 2D & danh sách sức chứa các kệ kho' },
      { key: 'locations:create', name: 'Thêm Kệ Kho Mới', description: 'Khai báo thêm kệ kho mới vào mặt bằng' },
      { key: 'locations:update', name: 'Cập Nhật Kệ Kho', description: 'Sửa tên kệ kho, mã kệ & sức chứa tối đa' },
      { key: 'locations:delete', name: 'Xóa Kệ Kho', description: 'Xóa vị trí kệ kho không còn sử dụng' },

      // 7. Báo Cáo & Dự Báo (REPORTS & FORECAST)
      { key: 'reports:read', name: 'Xem Báo Cáo & Xuất CSV', description: 'Xem biểu đồ thống kê tổng quan, báo cáo & xuất file CSV' },
      { key: 'forecast:read', name: 'Xem Dự Báo Nhu Cầu AI', description: 'Xem phân tích nhu cầu bằng AI & công thức EOQ' },

      // 8. Cảnh Báo & Giám Sát (ALERTS & SYSTEM)
      { key: 'alerts:read', name: 'Xem Cảnh Báo Kho Hàng', description: 'Xem thông báo hết hàng & cảnh báo chạm ngưỡng an toàn' },
      { key: 'system:read', name: 'Giám Sát Hệ Thống Microservices', description: 'Theo dõi CPU, RAM, Redis & log hoạt động server' },
    ];

    // Seed Permissions with updates
    for (const perm of defaultPermissions) {
      await this.permissionModel.findOneAndUpdate(
        { key: perm.key },
        { $set: { name: perm.name, description: perm.description } },
        { upsert: true }
      ).exec();
    }

    const allPermKeys = defaultPermissions.map(p => p.key);

    const defaultRoles = [
      {
        name: 'Admin',
        description: 'System Administrator',
        permissions: allPermKeys,
      },
      {
        name: 'Manager',
        description: 'Warehouse Manager',
        permissions: [
          'products:create',
          'products:update',
          'products:read',
          'stock:read',
          'stock:update',
          'adjustments:read',
          'adjustments:create',
          'adjustments:update',
          'transactions:create',
          'transactions:read',
          'locations:read',
          'locations:create',
          'locations:update',
          'reports:read',
          'forecast:read',
          'alerts:read',
        ],
      },
      {
        name: 'Staff',
        description: 'Warehouse Operator',
        permissions: [
          'products:read',
          'stock:read',
          'adjustments:read',
          'adjustments:create',
          'transactions:create',
          'transactions:read',
          'locations:read',
          'alerts:read',
        ],
      },
    ];

    // Seed Roles with description & permissions updates
    for (const role of defaultRoles) {
      const exists = await this.roleModel.findOne({ name: role.name }).exec();
      if (!exists) {
        await new this.roleModel(role).save();
      } else {
        // Automatically sync permissions for Admin and update description
        const updateFields: any = { description: role.description };
        if (role.name === 'Admin') {
          updateFields.permissions = allPermKeys;
        }
        await this.roleModel.findOneAndUpdate(
          { name: role.name },
          { $set: updateFields }
        ).exec();
      }
    }

    const bcrypt = require('bcryptjs');
    const defaultPasswordHash = await bcrypt.hash('123456', 10);

    // 1. Seed default Admin user
    const adminExists = await this.userModel.findOne({ email: 'admin@gmail.com' }).exec();
    if (!adminExists) {
      await new this.userModel({
        email: 'admin@gmail.com',
        password: defaultPasswordHash,
        fullname: 'System Administrator',
        role: 'Admin',
        address: 'Tru so chinh Hà Nội',
        phone: '0908200401',
        gender: 'Male',
        createdBy: 'system',
        updatedBy: 'system',
      }).save();
      console.log('Default Admin user (admin@gmail.com / 123456) seeded.');
    }

    // 2. Seed default Manager user
    const managerExists = await this.userModel.findOne({ email: 'manager@gmail.com' }).exec();
    if (!managerExists) {
      await new this.userModel({
        email: 'manager@gmail.com',
        password: defaultPasswordHash,
        fullname: 'Nguyen Van Manager',
        role: 'Manager',
        address: 'Chi nhanh TP.HCM',
        phone: '0908200402',
        gender: 'Male',
        createdBy: 'system',
        updatedBy: 'system',
      }).save();
      console.log('Default Manager user (manager@gmail.com / 123456) seeded.');
    }

    // 3. Seed default Staff user
    const staffExists = await this.userModel.findOne({ email: 'staff@gmail.com' }).exec();
    if (!staffExists) {
      await new this.userModel({
        email: 'staff@gmail.com',
        password: defaultPasswordHash,
        fullname: 'Tran Thi Staff',
        role: 'Staff',
        address: 'Chi nhanh Da Nang',
        phone: '0908200403',
        gender: 'Female',
        createdBy: 'system',
        updatedBy: 'system',
      }).save();
      console.log('Default Staff user (staff@gmail.com / 123456) seeded.');
    }

    console.log('Role, Permission, and User seeds successfully validated.');
  }

  async getRoles() {
    return await this.roleModel.find().exec();
  }

  async updateRole(name: string, updateData: { permissions?: string[]; description?: string }) {
    const update: any = {};
    if (updateData.permissions !== undefined) update.permissions = updateData.permissions;
    if (updateData.description !== undefined) update.description = updateData.description;

    const updatedRole = await this.roleModel.findOneAndUpdate(
      { name },
      { $set: update },
      { new: true }
    ).exec();
    return { success: !!updatedRole, data: updatedRole };
  }

  async createRole(roleData: any) {
    const { name, description } = roleData;
    if (!name) {
      throw new RpcException('Role name is required');
    }
    const exists = await this.roleModel.findOne({ name }).exec();
    if (exists) {
      throw new RpcException('Role name already exists');
    }
    const newRole = new this.roleModel({
      name,
      description,
      permissions: []
    });
    return await newRole.save();
  }

  async deleteRole(name: string) {
    const protectedRoles = ['Admin', 'Manager', 'Staff'];
    if (protectedRoles.includes(name)) {
      throw new RpcException('Cannot delete default system roles');
    }

    // Check if assigned to any user
    const usersWithRole = await this.userModel.findOne({ role: name }).exec();
    if (usersWithRole) {
      throw new RpcException('Cannot delete role because it is currently assigned to user(s)');
    }

    const deletedRole = await this.roleModel.findOneAndDelete({ name }).exec();
    if (!deletedRole) {
      throw new RpcException('Role not found');
    }
    return { success: true, message: 'Role deleted successfully' };
  }

  async getPermissions() {
    return await this.permissionModel.find().exec();
  }

  async findPermissionsForRole(roleName: string): Promise<string[]> {
    const roleObj = await this.roleModel.findOne({ name: roleName }).exec();
    return roleObj ? roleObj.permissions : [];
  }

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
