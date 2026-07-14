import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { ReportingServiceService } from './reporting-service.service';

@Controller()
export class ReportingServiceController {
  constructor(private readonly reportingService: ReportingServiceService) {}

  @MessagePattern('report.get_summary')
  async getSummaryReport() {
    return this.reportingService.getSummaryReport();
  }

  @MessagePattern('report.get_analytics')
  async getAnalyticsReport() {
    return this.reportingService.getAnalyticsReport();
  }
}
