import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @MessagePattern('report.get_summary')
  async getSummaryReport() {
    return this.reportsService.getSummaryReport();
  }

  @MessagePattern('report.get_forecast_trends')
  async getForecastTrends(@Payload() payload: { topN?: number; days?: number } = {}) {
    return this.reportsService.getForecastTrends(payload);
  }

  @MessagePattern('report.get_analytics')
  async getAnalytics(@Payload() payload: { trendDays?: number } = {}) {
    return this.reportsService.getAnalytics(payload);
  }
}
