import { Controller, Get, Post, Body, Param, Query, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Controller('procurement')
export class ProcurementController {
  constructor(
    @Inject('PROCUREMENT_SERVICE') private readonly procurementClient: ClientProxy,
  ) {}

  @Get('suppliers')
  async findAllSuppliers() {
    return firstValueFrom(this.procurementClient.send('procurement.suppliers.find_all', {}));
  }

  @Post('suppliers')
  async createSupplier(@Body() body: any) {
    return firstValueFrom(this.procurementClient.send('procurement.suppliers.create', body));
  }

  @Get('purchase-orders')
  async findAllPOs(@Query('status') status?: string, @Query('search') search?: string) {
    return firstValueFrom(this.procurementClient.send('procurement.po.find_all', { status, search }));
  }

  @Get('purchase-orders/:id')
  async findOnePO(@Param('id') id: string) {
    return firstValueFrom(this.procurementClient.send('procurement.po.find_one', id));
  }

  @Post('purchase-orders')
  async createPO(@Body() body: any) {
    return firstValueFrom(this.procurementClient.send('procurement.po.create', body));
  }

  @Post('purchase-orders/:id/approve')
  async approvePO(@Param('id') id: string) {
    return firstValueFrom(this.procurementClient.send('procurement.po.approve', id));
  }

  @Post('purchase-orders/:id/receive')
  async receivePO(@Param('id') id: string) {
    return firstValueFrom(this.procurementClient.send('procurement.po.receive', id));
  }

  @Post('trigger-auto-po')
  async triggerAutoPO() {
    return firstValueFrom(this.procurementClient.send('procurement.po.trigger_auto', {}));
  }
}
