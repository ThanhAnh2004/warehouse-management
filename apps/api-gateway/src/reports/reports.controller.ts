import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

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

  @Get('forecast-trends')
  @RequirePermissions('reports:read')
  @ApiQuery({ name: 'topN', required: false, type: Number })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getForecastTrends(
    @Query('topN') topN: string = '5',
    @Query('days') days: string = '7',
  ) {
    return this.reportingClient.send('report.get_forecast_trends', {
      topN: parseInt(topN, 10) || 5,
      days: parseInt(days, 10) || 7,
    });
  }

  @Get('analytics')
  @RequirePermissions('reports:read')
  @ApiQuery({ name: 'trendDays', required: false, type: Number })
  getAnalytics(@Query('trendDays') trendDays: string = '14') {
    return this.reportingClient.send('report.get_analytics', {
      trendDays: parseInt(trendDays, 10) || 14,
    });
  }
}
