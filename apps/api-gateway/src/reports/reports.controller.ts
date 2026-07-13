import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    @Inject('REPORTING_SERVICE') private readonly reportingClient: ClientProxy,
  ) {}

  @Get('summary')
  @Roles('Admin', 'Manager')
  getSummaryReport() {
    return this.reportingClient.send('report.get_summary', {});
  }
}
