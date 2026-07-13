import { Test, TestingModule } from '@nestjs/testing';
import { ReportingServiceController } from './reporting-service.controller';
import { ReportingServiceService } from './reporting-service.service';

describe('ReportingServiceController', () => {
  let reportingServiceController: ReportingServiceController;

  beforeEach(async () => {
    const mockClientProxy = { send: jest.fn() };
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ReportingServiceController],
      providers: [
        ReportingServiceService,
        { provide: 'INVENTORY_SERVICE', useValue: mockClientProxy },
        { provide: 'TRANSACTION_SERVICE', useValue: mockClientProxy }
      ],
    }).compile();

    reportingServiceController = app.get<ReportingServiceController>(ReportingServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(reportingServiceController.getHello()).toBe('Hello World!');
    });
  });
});
