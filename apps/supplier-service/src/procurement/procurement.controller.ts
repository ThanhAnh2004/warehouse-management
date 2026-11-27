import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { ProcurementService } from './procurement.service';
import { CreatePODto, CreateSupplierDto } from './dto/create-po.dto';

@Controller()
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @MessagePattern('procurement.suppliers.find_all')
  findAllSuppliers() {
    return this.procurementService.findAllSuppliers();
  }

  @MessagePattern('procurement.suppliers.find_one')
  findOneSupplier(@Payload() id: string) {
    return this.procurementService.findOneSupplier(id);
  }

  @MessagePattern('procurement.suppliers.create')
  createSupplier(@Payload() dto: CreateSupplierDto) {
    return this.procurementService.createSupplier(dto);
  }

  @MessagePattern('procurement.suppliers.update')
  updateSupplier(@Payload() payload: { id: string; data: Partial<CreateSupplierDto> }) {
    return this.procurementService.updateSupplier(payload.id, payload.data);
  }

  @MessagePattern('procurement.suppliers.delete')
  deleteSupplier(@Payload() id: string) {
    return this.procurementService.deleteSupplier(id);
  }

  @EventPattern('product.updated')
  handleProductUpdated(@Payload() data: { productId: string; sku: string; name: string }) {
    return this.procurementService.syncUpdatedProduct(data);
  }

  @EventPattern('product.deleted')
  handleProductDeleted(@Payload() data: { productId: string }) {
    return this.procurementService.removeProductFromAllSuppliers(data.productId);
  }

  @MessagePattern('procurement.suppliers.get_products')
  getSupplierProducts(@Payload() supplierId: string) {
    return this.procurementService.getSupplierProducts(supplierId);
  }

  @MessagePattern('procurement.suppliers.assign_product')
  assignSupplierProduct(
    @Payload()
    data: {
      supplierId: string;
      productId: string;
      productSku?: string;
      productName?: string;
      supplyPrice?: number;
      minOrderQty?: number;
      leadTimeDays?: number;
    },
  ) {
    return this.procurementService.assignSupplierProduct(data);
  }

  @MessagePattern('procurement.suppliers.remove_product')
  removeSupplierProduct(@Payload() data: { supplierId: string; productId: string }) {
    return this.procurementService.removeSupplierProduct(data.supplierId, data.productId);
  }

  @MessagePattern('procurement.po.find_all')
  findAllPOs(@Payload() query: { status?: string; search?: string } = {}) {
    return this.procurementService.findAllPOs(query);
  }

  @MessagePattern('procurement.po.find_one')
  findOnePO(@Payload() id: string) {
    return this.procurementService.findOnePO(id);
  }

  @MessagePattern('procurement.po.create')
  createPO(@Payload() dto: CreatePODto) {
    return this.procurementService.createPO(dto);
  }

  @MessagePattern('procurement.po.approve')
  approvePO(@Payload() id: string) {
    return this.procurementService.approvePO(id);
  }

  @MessagePattern('procurement.po.receive')
  receivePO(@Payload() id: string) {
    return this.procurementService.receivePO(id);
  }

  @MessagePattern('procurement.po.trigger_auto')
  triggerAutoPO() {
    return this.procurementService.triggerAutoPO();
  }
}
