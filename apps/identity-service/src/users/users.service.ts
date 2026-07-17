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
      { key: 'users:read', name: 'Read Users', description: 'View list of staff members' },
      { key: 'users:delete', name: 'Delete User Accounts', description: 'Delete staff member accounts' },
      { key: 'products:create', name: 'Create Products', description: 'Create new products' },
      { key: 'products:update', name: 'Update Products', description: 'Update product details' },
      { key: 'products:delete', name: 'Delete Products', description: 'Delete products from the system' },
      { key: 'products:read', name: 'Read Products', description: 'View list & details of products' },
      { key: 'stock:read', name: 'Read Stock', description: 'View inventory stock levels' },
      { key: 'forecast:read', name: 'Read AI Forecast', description: 'View AI demand forecast predictions' },
      { key: 'transactions:create', name: 'Create Transactions', description: 'Create inbound/outbound stock transfers' },
      { key: 'transactions:read', name: 'Read Transaction History', description: 'View historical inventory transfers' },
      { key: 'reports:read', name: 'Read Reports', description: 'View high-level system dashboards & reports' },
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
          'forecast:read',
          'transactions:create',
          'transactions:read',
          'reports:read',
        ],
      },
      {
        name: 'Staff',
        description: 'Warehouse Operator',
        permissions: [
          'products:read',
          'stock:read',
          'transactions:create',
          'transactions:read',
        ],
      },
    ];

    // Seed Roles with description updates
    for (const role of defaultRoles) {
      const exists = await this.roleModel.findOne({ name: role.name }).exec();
      if (!exists) {
        await new this.roleModel(role).save();
      } else {
        await this.roleModel.findOneAndUpdate(
          { name: role.name },
          { $set: { description: role.description } }
        ).exec();
      }
    }
    console.log('Role and Permission seeds successfully validated.');
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
