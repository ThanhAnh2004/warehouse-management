import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
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
