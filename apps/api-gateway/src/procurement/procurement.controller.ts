import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions, RequireAnyPermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Procurement')
@ApiBearerAuth('JWT-auth')
@Controller('procurement')
@UseGuards(AuthGuard, PermissionsGuard)
export class ProcurementController {
  constructor(
    @Inject('PROCUREMENT_SERVICE') private readonly procurementClient: ClientProxy,
  ) {}

  @RequireAnyPermissions('procurement:read', 'products:create')
  @Get('suppliers')
  async findAllSuppliers() {
    return firstValueFrom(this.procurementClient.send('procurement.suppliers.find_all', {}));
  }

  @RequireAnyPermissions('procurement:read', 'products:create')
  @Get('suppliers/:id/products')
  async getSupplierProducts(@Param('id') id: string) {
    return firstValueFrom(this.procurementClient.send('procurement.suppliers.get_products', id));
  }

  @RequireAnyPermissions('procurement:read', 'products:create')
  @Get('suppliers/:id')
  async findOneSupplier(@Param('id') id: string) {
    return firstValueFrom(this.procurementClient.send('procurement.suppliers.find_one', id));
  }

  @RequirePermissions('procurement:create')
  @Post('suppliers')
  async createSupplier(@Body() body: any) {
    return firstValueFrom(this.procurementClient.send('procurement.suppliers.create', body));
  }

  @RequirePermissions('procurement:create')
  @Patch('suppliers/:id')
  async updateSupplier(@Param('id') id: string, @Body() body: any) {
    const res = await firstValueFrom(
      this.procurementClient.send('procurement.suppliers.update', { id, data: body }),
    );
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Không thể cập nhật nhà cung cấp');
    }
    return res?.data || res;
  }

  @RequirePermissions('procurement:create')
  @Delete('suppliers/:id')
  async deleteSupplier(@Param('id') id: string) {
    const res = await firstValueFrom(
      this.procurementClient.send('procurement.suppliers.delete', id),
    );
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Không thể xóa nhà cung cấp');
    }
    return res;
  }

  @RequireAnyPermissions('procurement:create', 'products:create', 'products:update')
  @Post('suppliers/:id/products')
  async assignSupplierProduct(@Param('id') id: string, @Body() body: any) {
    const res = await firstValueFrom(
      this.procurementClient.send('procurement.suppliers.assign_product', {
        ...body,
        supplierId: id,
      }),
    );
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Không thể gán sản phẩm cho nhà cung cấp');
    }
    return res;
  }

  @RequireAnyPermissions('procurement:create', 'products:create', 'products:update')
  @Patch('suppliers/:id/products/:productId')
  async updateSupplierProduct(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() body: any,
  ) {
    const res = await firstValueFrom(
      this.procurementClient.send('procurement.suppliers.assign_product', {
        ...body,
        supplierId: id,
        productId,
      }),
    );
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Không thể cập nhật giá nhập nhà cung cấp');
    }
    return res;
  }

  @RequireAnyPermissions('procurement:create', 'products:update')
  @Delete('suppliers/:id/products/:productId')
  async removeSupplierProduct(@Param('id') id: string, @Param('productId') productId: string) {
    const res = await firstValueFrom(
      this.procurementClient.send('procurement.suppliers.remove_product', {
        supplierId: id,
        productId,
      }),
    );
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Không thể gỡ sản phẩm khỏi nhà cung cấp');
    }
    return res;
  }

  @RequirePermissions('procurement:read')
  @Get('purchase-orders')
  async findAllPOs(@Query('status') status?: string, @Query('search') search?: string) {
    return firstValueFrom(this.procurementClient.send('procurement.po.find_all', { status, search }));
  }

  @RequirePermissions('procurement:read')
  @Get('purchase-orders/:id')
  async findOnePO(@Param('id') id: string) {
    return firstValueFrom(this.procurementClient.send('procurement.po.find_one', id));
  }

  @RequirePermissions('procurement:create')
  @Post('purchase-orders')
  async createPO(@Body() body: any) {
    const res = await firstValueFrom(this.procurementClient.send('procurement.po.create', body));
    if (res && res.success === false) {
      throw new BadRequestException(res.message || 'Không thể tạo đơn đặt hàng PO');
    }
    return res;
  }

  @RequireAnyPermissions('procurement:approve', 'procurement:create')
  @Post('purchase-orders/:id/approve')
  async approvePO(@Param('id') id: string) {
    return firstValueFrom(this.procurementClient.send('procurement.po.approve', id));
  }

  @RequirePermissions('procurement:receive')
  @Post('purchase-orders/:id/receive')
  async receivePO(@Param('id') id: string) {
    return firstValueFrom(this.procurementClient.send('procurement.po.receive', id));
  }

  @RequirePermissions('procurement:create')
  @Post('trigger-auto-po')
  async triggerAutoPO() {
    return firstValueFrom(this.procurementClient.send('procurement.po.trigger_auto', {}));
  }
}
