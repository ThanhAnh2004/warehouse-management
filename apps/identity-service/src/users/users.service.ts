import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
      // 1. Tổng Quan (DASHBOARD)
      { key: 'dashboard:read', name: 'Xem Trang Chủ Tổng Quan', description: 'Theo dõi KPI tổng hợp tồn kho, không gian phân khu và hàng sắp thiếu' },

      // 2. Quản lý Danh Mục Sản Phẩm (PRODUCTS)
      { key: 'products:read', name: 'Xem Danh Mục & Chi Tiết Sản Phẩm', description: 'Xem danh sách mặt hàng, giá bán và thông số kỹ thuật sản phẩm' },
      { key: 'products:create', name: 'Thêm Sản Phẩm Mới', description: 'Khai báo sản phẩm mới vào hệ thống danh mục điện máy' },
      { key: 'products:update', name: 'Cập Nhật Sản Phẩm & Ngưỡng Min', description: 'Chỉnh sửa thông tin, giá bán, hình ảnh & đồng bộ ngưỡng Min Stock' },
      { key: 'products:delete', name: 'Xóa Sản Phẩm Kho', description: 'Xóa sản phẩm khỏi danh mục hệ thống' },

      // 3. Quản lý Tồn Kho Thực Tế (STOCK)
      { key: 'stock:read', name: 'Xem Tồn Kho Thực Tế', description: 'Theo dõi số lượng tồn kho và mức cảnh báo thiếu hàng theo thời gian thực' },
      { key: 'stock:update', name: 'Nhập Bổ Sung Nhanh Tồn Kho', description: 'Nhập bổ sung tồn kho nhanh từ danh sách hàng dưới ngưỡng Min & đề xuất EOQ' },

      // 4. Sổ Cái Lịch Sử Giao Dịch Kho (TRANSACTIONS - AUDIT LEDGER)
      { key: 'transactions:read', name: 'Xem Sổ Cái Lịch Sử Giao Dịch', description: 'Xem nhật ký tự động Nhập kho, Xuất kho, Điều chuyển kệ, Kiểm kê & Saga Trace' },
      { key: 'transactions:export', name: 'Xuất Báo Cáo CSV Giao Dịch', description: 'Tải xuống file CSV nhật ký lịch sử giao dịch kho hàng' },

      // 5. Kiểm Kê & Điều Chỉnh (ADJUSTMENTS)
      { key: 'adjustments:read', name: 'Xem Báo Cáo Kiểm Kê', description: 'Xem lịch sử & chi tiết các phiếu kiểm kê, báo hỏng, thất thoát kho' },
      { key: 'adjustments:create', name: 'Lập Phiếu Kiểm Kê & Báo Hỏng', description: 'Tạo biên bản kiểm kê thực tế, báo hỏng, thất thoát hoặc dôi dư hàng hóa' },
      { key: 'adjustments:update', name: 'Sửa Báo Cáo Kiểm Kê', description: 'Chỉnh sửa số lượng hoặc ghi chú biên bản điều chỉnh kiểm kê' },
      { key: 'adjustments:delete', name: 'Xóa Báo Cáo Kiểm Kê', description: 'Xóa phiếu kiểm kê điều chỉnh khỏi hệ thống' },

      // 6. Quản Lý Đơn Hàng & Soạn Hàng (ORDERS - CỬA 02)
      { key: 'orders:read', name: 'Xem Danh Sách Đơn Hàng', description: 'Xem danh sách đơn bán hàng, điều chuyển & luồng điều phối Saga' },
      { key: 'orders:create', name: 'Tạo Đơn Hàng Mới', description: 'Lập đơn hàng mới, tính phí ship và kích hoạt Saga giữ tồn kho' },
      { key: 'orders:pick', name: 'Soạn Hàng & Quét Serial/IMEI', description: 'Lập phiếu Pick List, xác nhận nhặt hàng theo kệ & gắn Serial/IMEI' },
      { key: 'orders:dispatch', name: 'Xuất Xưởng Đơn Hàng (Cửa 02)', description: 'Xác nhận xuất xưởng qua CỬA 02 - OUT và trừ tồn kho thực tế' },

      // 7. Thu Mua & Nhà Cung Cấp (PROCUREMENT - CỬA 01)
      { key: 'procurement:read', name: 'Xem Đơn Mua Hàng & Nhà Cung Cấp', description: 'Xem danh sách nhà cung ứng chính hãng & đơn đặt hàng PO' },
      { key: 'procurement:create', name: 'Tạo Đơn Mua Hàng & Thêm NCC', description: 'Thêm nhà cung cấp mới và lập đơn đặt hàng PO gửi nhà phân phối' },
      { key: 'procurement:receive', name: 'Tiếp Nhận Nhập Kho (Cửa 01)', description: 'Tiếp nhận hàng từ NCC qua CỬA 01 - IN và cộng tồn kho tự động' },

      // 8. Kệ Kho & Sơ Đồ Kho (LOCATIONS)
      { key: 'locations:read', name: 'Xem Sơ Đồ Kệ Kho & Danh Mục Kệ', description: 'Xem bản đồ 2D mặt bằng kho, tỷ lệ lấp đầy & chi tiết các tầng kệ' },
      { key: 'locations:create', name: 'Thêm Kệ / Tầng Kho Mới', description: 'Khai báo thêm vị trí kệ kho mới vào mặt bằng' },
      { key: 'locations:update', name: 'Cập Nhật Thông Tin Kệ Kho', description: 'Sửa phân khu, tên kệ kho & giới hạn sức chứa/tải trọng' },
      { key: 'locations:delete', name: 'Xóa Kệ Kho', description: 'Xóa vị trí kệ kho không còn sử dụng' },
      { key: 'locations:allocate', name: 'AI Gợi Ý & Phân Hàng Lên Kệ', description: 'Sử dụng AI gợi ý vị trí cất hàng, xếp hàng lên kệ & chuyển tầng' },

      // 9. Báo Cáo & Thống Kê (REPORTS)
      { key: 'reports:read', name: 'Xem Báo Cáo & Thống Kê Chi Tiết', description: 'Xem doanh số xuất kho, top bán chạy & biến động nhập xuất theo tháng' },
      { key: 'reports:export', name: 'Xuất Báo Cáo Excel Tổng Hợp', description: 'Xuất dữ liệu báo cáo thống kê nhiều sheet ra file Excel (.xlsx)' },

      // 10. Dự Báo Nhu Cầu & AI (FORECAST)
      { key: 'forecast:read', name: 'Xem Dự Báo AI & Tối Ưu EOQ/ROP', description: 'Xem biểu đồ dự báo XGBoost, tính toán Safety Stock, ROP và EOQ' },

      // 11. Cảnh Báo Kho Hàng (ALERTS)
      { key: 'alerts:read', name: 'Xem Cảnh Báo Kho Hàng', description: 'Xem thông báo hết hàng, chạm ngưỡng an toàn Min/Max & đánh dấu đã đọc' },
      { key: 'alerts:manage', name: 'Quản Lý & Xóa Cảnh Báo', description: 'Xóa nhật ký cảnh báo kho hàng sau khi đã xử lý' },

      // 12. Quản lý Người dùng (USERS)
      { key: 'users:read', name: 'Xem Danh Sách Tài Khoản', description: 'Xem danh sách tài khoản nhân sự và vai trò trong hệ thống' },
      { key: 'users:create', name: 'Tạo Tài Khoản Mới', description: 'Khai báo tài khoản người dùng mới vào hệ thống' },
      { key: 'users:update', name: 'Cập Nhật Tài Khoản', description: 'Chỉnh sửa thông tin thành viên và phân bổ vai trò' },
      { key: 'users:delete', name: 'Xóa Tài Khoản', description: 'Xóa tài khoản người dùng khỏi hệ thống' },

      // 13. Quản lý Vai trò & Phân quyền (ROLES)
      { key: 'roles:read', name: 'Xem Vai Trò & Ma Trận Quyền', description: 'Xem danh sách vai trò và cấu hình quyền hạn tương ứng' },
      { key: 'roles:manage', name: 'Quản Lý & Phân Bổ Quyền', description: 'Tạo/sửa/xóa vai trò và thiết lập ma trận phân quyền chi tiết' },

      // 14. Giám Sát Hạ Tầng & Message Bus (SYSTEM)
      { key: 'system:read', name: 'Giám Sát Hệ Thống Microservices', description: 'Theo dõi trạng thái các service, database và RabbitMQ/Kafka' },
      { key: 'system:manage', name: 'Xử Lý Sự Cố Message Bus (DLQ)', description: 'Đẩy lại tin nhắn lỗi từ Dead Letter Queue & dọn dẹp hàng đợi' },
    ];

    const allPermKeys = defaultPermissions.map(p => p.key);

    // Seed Permissions with updates and remove obsolete keys
    for (const perm of defaultPermissions) {
      await this.permissionModel.findOneAndUpdate(
        { key: perm.key },
        { $set: { name: perm.name, description: perm.description } },
        { upsert: true }
      ).exec();
    }
    await this.permissionModel.deleteMany({ key: { $nin: allPermKeys } }).exec();
    await this.roleModel.updateMany({}, { $pull: { permissions: { $nin: allPermKeys } } }).exec();
    await this.userModel.updateMany(
      { permissions: { $exists: true, $ne: null } },
      { $pull: { permissions: { $nin: allPermKeys } } }
    ).exec();

    const defaultRoles = [
      {
        name: 'Admin',
        description: 'Quản Trị Viên Hệ Thống (Toàn quyền vận hành, nhân sự, RBAC & hạ tầng)',
        permissions: allPermKeys,
      },
      {
        name: 'Manager',
        description: 'Quản Lý Kho Hàng (Điều hành kho, thu mua, đơn hàng, báo cáo & nhân sự kho)',
        permissions: [
          'dashboard:read',
          'products:read', 'products:create', 'products:update', 'products:delete',
          'stock:read', 'stock:update',
          'transactions:read', 'transactions:export',
          'adjustments:read', 'adjustments:create', 'adjustments:update', 'adjustments:delete',
          'orders:read', 'orders:create', 'orders:pick', 'orders:dispatch',
          'procurement:read', 'procurement:create', 'procurement:receive',
          'locations:read', 'locations:create', 'locations:update', 'locations:delete', 'locations:allocate',
          'reports:read', 'reports:export',
          'forecast:read',
          'alerts:read', 'alerts:manage',
          'users:read', 'users:create', 'users:update',
        ],
      },
      {
        name: 'Staff',
        description: 'Nhân Viên Kho (Tiếp nhận Cửa 01, xếp kệ, soạn & xuất Cửa 02, kiểm kê thực tế)',
        permissions: [
          'products:read',
          'stock:read',
          'transactions:read',
          'adjustments:read', 'adjustments:create',
          'orders:read', 'orders:pick', 'orders:dispatch',
          'procurement:read', 'procurement:receive',
          'locations:read', 'locations:allocate',
          'alerts:read',
        ],
      },
    ];

    // Seed Roles: always ensure Root Admin has isSystemAdmin & all permissions (preserving renamed role name); create Manager/Staff only on fresh install
    const existingRolesCount = await this.roleModel.countDocuments().exec();
    const rootAdminExisting = await this.roleModel
      .findOne({ $or: [{ isSystemAdmin: true }, { name: 'Admin' }, { name: /^Quản trị viên$/i }] })
      .exec();

    if (!rootAdminExisting) {
      await new this.roleModel({ ...defaultRoles[0], isSystemAdmin: true }).save();
    } else {
      await this.roleModel
        .findOneAndUpdate(
          { _id: rootAdminExisting._id },
          { $set: { isSystemAdmin: true, permissions: allPermKeys } },
        )
        .exec();
    }

    for (const role of defaultRoles.slice(1)) {
      const exists = await this.roleModel.findOne({ name: role.name }).exec();
      if (!exists && existingRolesCount <= 1) {
        await new this.roleModel(role).save();
      }
    }

    const bcrypt = require('bcryptjs');
    const defaultPasswordHash = await bcrypt.hash('123456', 10);

    // 1. Seed default Admin user
    const adminRoleName = rootAdminExisting?.name || 'Admin';
    const adminExists = await this.userModel.findOne({ email: 'admin@gmail.com' }).exec();
    if (!adminExists) {
      await new this.userModel({
        email: 'admin@gmail.com',
        password: defaultPasswordHash,
        fullname: 'System Administrator',
        role: adminRoleName,
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
    const [roles, counts] = await Promise.all([
      this.roleModel.find().sort({ createdAt: 1 }).exec(),
      this.userModel.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]).exec(),
    ]);
    const countMap: Record<string, number> = {};
    for (const c of counts) {
      if (c._id) countMap[c._id] = c.count;
    }
    return roles.map((r) => {
      const obj: any = r.toObject ? r.toObject() : { ...r };
      obj.userCount = countMap[obj.name] || 0;
      return obj;
    });
  }

  private isRootAdminRole(roleObj: { name?: string; isSystemAdmin?: boolean } | null | undefined): boolean {
    if (!roleObj) return false;
    return Boolean(roleObj.isSystemAdmin) || /^(admin|quản trị viên)$/i.test((roleObj.name || '').trim());
  }

  async isRootAdminRoleName(roleName?: string): Promise<boolean> {
    if (!roleName) return false;
    if (/^(admin|quản trị viên)$/i.test(roleName.trim())) return true;
    const roleObj = await this.roleModel.findOne({ name: roleName }).exec();
    return Boolean(roleObj?.isSystemAdmin);
  }

  async updateRole(name: string, updateData: { newName?: string; permissions?: string[]; description?: string }) {
    const existing = await this.roleModel.findOne({ name }).exec();
    if (!existing) {
      return { success: false, message: `Không tìm thấy vai trò "${name}".` };
    }

    const isRootAdmin = this.isRootAdminRole(existing);
    const update: any = {};
    const targetName = updateData.newName !== undefined ? updateData.newName.trim() : name;

    if (updateData.newName !== undefined && targetName !== name) {
      if (!targetName) {
        return { success: false, message: 'Tên vai trò mới không được để trống.' };
      }
      const conflict = await this.roleModel
        .findOne({ name: { $regex: new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, _id: { $ne: existing._id } })
        .exec();
      if (conflict) {
        return { success: false, message: `Vai trò "${conflict.name}" đã tồn tại trong hệ thống.` };
      }
      update.name = targetName;
    }

    if (updateData.permissions !== undefined) {
      if (isRootAdmin) {
        return { success: false, message: 'Không thể sửa đổi quyền hạn của vai trò Quản trị viên hệ thống.' };
      }
      update.permissions = updateData.permissions;
    }

    if (updateData.description !== undefined) {
      update.description = updateData.description.trim();
    }

    const updatedRole = await this.roleModel.findOneAndUpdate(
      { _id: existing._id },
      { $set: update },
      { new: true }
    ).exec();

    // Update user role references if renamed
    if (update.name && update.name !== name) {
      await this.userModel.updateMany(
        { role: name },
        { $set: { role: update.name } }
      ).exec();
    }

    // Khi Admin đổi quyền của Role, reset custom permissions override của các users thuộc role này
    if (updateData.permissions !== undefined) {
      await this.userModel.updateMany(
        { role: update.name || name },
        { $unset: { permissions: '' } }
      ).exec();
    }

    const userCount = await this.userModel.countDocuments({ role: updatedRole?.name || name }).exec();
    const resultObj: any = updatedRole?.toObject ? updatedRole.toObject() : updatedRole;
    if (resultObj) resultObj.userCount = userCount;

    return { success: !!updatedRole, data: resultObj };
  }

  async createRole(roleData: { name: string; description?: string; permissions?: string[] }) {
    const trimmedName = (roleData?.name || '').trim();
    if (!trimmedName) {
      return { success: false, message: 'Tên vai trò không được để trống.' };
    }
    const exists = await this.roleModel
      .findOne({ name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } })
      .exec();
    if (exists) {
      return { success: false, message: `Vai trò "${exists.name}" đã tồn tại.` };
    }

    const newRole = new this.roleModel({
      name: trimmedName,
      description: (roleData.description || '').trim(),
      permissions: Array.isArray(roleData.permissions) ? roleData.permissions : [],
    });
    const saved = await newRole.save();
    const obj: any = saved.toObject ? saved.toObject() : { ...saved };
    obj.userCount = 0;
    return { success: true, data: obj };
  }

  async deleteRole(name: string, reassignTo?: string) {
    const targetRole = await this.roleModel.findOne({ name }).exec();
    if (!targetRole) {
      return { success: false, message: `Không tìm thấy vai trò "${name}".` };
    }
    if (this.isRootAdminRole(targetRole)) {
      return { success: false, message: 'Không thể xóa vai trò Quản trị viên hệ thống.' };
    }

    const userCount = await this.userModel.countDocuments({ role: name }).exec();
    if (userCount > 0) {
      if (!reassignTo || reassignTo === name) {
        return {
          success: false,
          message: `Vai trò "${name}" đang có ${userCount} tài khoản sử dụng. Vui lòng chọn vai trò thay thế trước khi xóa.`,
        };
      }
      const fallbackRole = await this.roleModel.findOne({ name: reassignTo }).exec();
      if (!fallbackRole) {
        return { success: false, message: `Vai trò thay thế "${reassignTo}" không tồn tại.` };
      }
      await this.userModel.updateMany(
        { role: name },
        { $set: { role: reassignTo }, $unset: { permissions: '' } }
      ).exec();
    }

    await this.roleModel.findOneAndDelete({ _id: targetRole._id }).exec();
    return { success: true, message: `Đã xóa vai trò "${name}" thành công!` };
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
    try {
      if (!id) return null;
      let user: any = null;
      if (Types.ObjectId.isValid(id)) {
        user = await this.userModel.findById(id).select('-password').exec().catch(() => null);
      }
      if (!user) {
        user = await this.userModel.findOne({ _id: id as any }).select('-password').exec().catch(() => null);
      }
      if (!user) {
        user = await this.userModel.collection.findOne({ _id: id as any });
      }
      if (!user) return null;
      const userObj: any = user.toObject ? user.toObject() : { ...user };
      delete userObj.password;
      userObj.id = userObj._id ? userObj._id.toString() : id;
      userObj.isSystemAdmin = await this.isRootAdminRoleName(userObj.role);
      userObj.permissions = (userObj.permissions !== null && userObj.permissions !== undefined)
        ? userObj.permissions
        : await this.findPermissionsForRole(userObj.role);
      return userObj;
    } catch (error: any) {
      console.error('findOne error in identity-service:', error?.message || error);
      return null;
    }
  }

  // Tìm một người dùng theo ID kèm mật khẩu
  async findOneWithPassword(id: string) {
    return await this.userModel.findById(id).exec();
  }

  // Cập nhật thông tin người dùng
  async update(id: string, updateData: any) {
    const { email: _, password: __, ...allowedUpdates } = updateData;

    try {
      const setObj: any = {};
      const unsetObj: any = {};

      for (const [key, val] of Object.entries(allowedUpdates)) {
        if (key === 'permissions') {
          if (val === null || val === undefined) {
            unsetObj.permissions = "";
          } else {
            setObj.permissions = val;
          }
        } else {
          setObj[key] = val;
        }
      }

      const mongoUpdate: any = {};
      if (Object.keys(setObj).length > 0) mongoUpdate.$set = setObj;
      if (Object.keys(unsetObj).length > 0) mongoUpdate.$unset = unsetObj;

      let updatedUser: any = null;
      if (Types.ObjectId.isValid(id)) {
        updatedUser = await this.userModel.findByIdAndUpdate(
          id,
          mongoUpdate,
          { new: true, runValidators: true }
        ).select('-password').exec().catch(() => null);
      }
      if (!updatedUser) {
        updatedUser = await this.userModel.findOneAndUpdate(
          { _id: id as any },
          mongoUpdate,
          { new: true }
        ).select('-password').exec().catch(() => null);
      }

      if (!updatedUser) {
        return { success: false, message: 'User not found' };
      }

      const userObj: any = updatedUser.toObject ? updatedUser.toObject() : updatedUser;
      userObj.id = userObj._id ? userObj._id.toString() : id;
      userObj.isSystemAdmin = await this.isRootAdminRoleName(userObj.role);
      userObj.permissions = (userObj.permissions !== null && userObj.permissions !== undefined)
        ? userObj.permissions
        : await this.findPermissionsForRole(userObj.role);
      return { success: true, data: userObj };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Update failed' };
    }
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
