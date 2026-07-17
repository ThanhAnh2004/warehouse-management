import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Controller('reports')
@UseGuards(AuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    @Inject('REPORTING_SERVICE') private readonly reportingClient: ClientProxy,
  ) {}

  @Get('summary')
  @RequirePermissions('reports:read')
  getSummaryReport() {
    return this.reportingClient.send('report.get_summary', {});
  }
}
