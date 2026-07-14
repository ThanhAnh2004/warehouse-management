import { Test, TestingModule } from '@nestjs/testing';
import { ReportingServiceService } from './reporting-service.service';
import { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';

describe('ReportingServiceService', () => {
  let service: ReportingServiceService;
  let inventoryClient: ClientProxy;
  let transactionClient: ClientProxy;

  beforeEach(async () => {
    // Mock the ClientProxy so we don't actually make TCP requests
    const mockClientProxy = {
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportingServiceService,
        {
          provide: 'INVENTORY_SERVICE',
          useValue: mockClientProxy,
        },
        {
          provide: 'TRANSACTION_SERVICE',
          useValue: mockClientProxy,
        },
      ],
    }).compile();

    service = module.get<ReportingServiceService>(ReportingServiceService);
    inventoryClient = module.get<ClientProxy>('INVENTORY_SERVICE');
    transactionClient = module.get<ClientProxy>('TRANSACTION_SERVICE');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate summary report correctly with valid data', async () => {
    // Mock inventory data
    const mockInventoryData = {
      data: [
        { id: 1, price: 100000 },
        { id: 2, price: 150000 },
      ]
    };

    // Mock transaction data
    const mockTransactionData = [
      { type: 'INBOUND', quantity: 10 },
      { type: 'INBOUND', quantity: 5 },
      { type: 'OUTBOUND', quantity: 3 },
      { type: 'TRANSFER', quantity: 2 }, // Just in case, the logic only sums INBOUND and OUTBOUND
    ];

    jest.spyOn(inventoryClient, 'send').mockImplementationOnce(() => of(mockInventoryData));
    jest.spyOn(transactionClient, 'send').mockImplementationOnce(() => of(mockTransactionData));

    const result = await service.getSummaryReport();

    expect(result.totalProducts).toBe(2);
    expect(result.totalInventoryValue).toBe(250000); // 100k + 150k
    expect(result.totalImports).toBe(15); // 10 + 5
    expect(result.totalExports).toBe(3); // 3
    expect(result.reportDate).toBeDefined();
  });

  it('should handle errors gracefully if microservices fail', async () => {
    jest.spyOn(inventoryClient, 'send').mockImplementationOnce(() => throwError(() => new Error('Inventory Failed')));
    jest.spyOn(transactionClient, 'send').mockImplementationOnce(() => throwError(() => new Error('Transaction Failed')));

    const result = await service.getSummaryReport();

    expect(result.totalProducts).toBe(0);
    expect(result.totalInventoryValue).toBe(0);
    expect(result.totalImports).toBe(0);
    expect(result.totalExports).toBe(0);
    expect(result.reportDate).toBeDefined();
  });
});
