import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ReportingServiceService } from './reporting-service.service';

@Controller()
export class ReportingServiceController {
  constructor(private readonly reportingService: ReportingServiceService) {}

  @MessagePattern('report.get_summary')
  async getSummaryReport() {
    return this.reportingService.getSummaryReport();
  }

  @MessagePattern('report.get_forecast_trends')
  async getForecastTrends(@Payload() payload: { topN?: number; days?: number } = {}) {
    return this.reportingService.getForecastTrends(payload);
  }

  @MessagePattern('report.get_analytics')
  async getAnalytics(@Payload() payload: { trendDays?: number } = {}) {
    return this.reportingService.getAnalytics(payload);
  }
}
