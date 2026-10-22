import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { TransactionSagaOrchestrator } from './transaction-saga.orchestrator';
import { SagaInstance, SagaStatus, SagaType } from '../entities/saga-instance.entity';
import { Transaction, TransactionStatus, TransactionType } from '../entities/transaction.entity';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

describe('TransactionSagaOrchestrator', () => {
  let orchestrator: TransactionSagaOrchestrator;
  let inventoryClient: { send: jest.Mock };
  let kafkaProducer: { emit: jest.Mock };
  let sagaRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let transactionRepository: {
    save: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    sagaRepository = {
      create: jest.fn((dto) => ({ ...dto, stepLogs: [] })),
      save: jest.fn((entity) => Promise.resolve({ id: 'saga-uuid', ...entity })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(),
    };

    transactionRepository = {
      save: jest.fn((tx) => Promise.resolve(tx)),
      findOne: jest.fn((query) => Promise.resolve(null)),
    };

    inventoryClient = {
      send: jest.fn(),
    };

    kafkaProducer = {
      emit: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionSagaOrchestrator,
        { provide: getRepositoryToken(SagaInstance), useValue: sagaRepository },
        { provide: getRepositoryToken(Transaction), useValue: transactionRepository },
        { provide: 'INVENTORY_SERVICE', useValue: inventoryClient },
        { provide: KafkaProducerService, useValue: kafkaProducer },
      ],
    }).compile();

    orchestrator = module.get<TransactionSagaOrchestrator>(TransactionSagaOrchestrator);
  });

  it('should be defined', () => {
    expect(orchestrator).toBeDefined();
  });

  describe('TRANSFER Saga', () => {
    it('thành công cả 2 bước -> Saga COMPLETED và ghi log các bước', async () => {
      inventoryClient.send.mockReturnValue(of({ success: true }));

      const tx: Transaction = {
        id: 'tx-1',
        productId: 'prod-1',
        type: TransactionType.TRANSFER,
        quantity: 20,
        locationFrom: 'A01',
        locationTo: 'B01',
        status: TransactionStatus.PENDING,
        note: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-1',
        updatedBy: '',
        sagaId: '',
      };

      const result = await orchestrator.executeTransactionSaga(tx);

      expect(inventoryClient.send).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(sagaRepository.save).toHaveBeenCalled();
      expect(kafkaProducer.emit).toHaveBeenCalledWith(
        'warehouse.transactions',
        'prod-1',
        expect.objectContaining({
          transactionId: 'tx-1',
          productId: 'prod-1',
          type: TransactionType.TRANSFER,
          quantity: 20,
        }),
      );
    });

    it('bước 2 (kệ đích) lỗi -> tự động bù trừ kệ nguồn -> Saga COMPENSATED, Tx FAILED', async () => {
      inventoryClient.send
        .mockReturnValueOnce(of({ success: true })) // Step 1 DEDUCT_SOURCE: OK
        .mockReturnValueOnce(throwError(() => new RpcException('Kệ đích B01 đã quá tải'))) // Step 2 CREDIT_DEST: Lỗi
        .mockReturnValueOnce(of({ success: true })); // Step 3 COMPENSATE_SOURCE: OK

      const tx: Transaction = {
        id: 'tx-2',
        productId: 'prod-1',
        type: TransactionType.TRANSFER,
        quantity: 20,
        locationFrom: 'A01',
        locationTo: 'B01',
        status: TransactionStatus.PENDING,
        note: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user-1',
        updatedBy: '',
        sagaId: '',
      };

      const result = await orchestrator.executeTransactionSaga(tx);

      // Gọi 3 lần: trừ nguồn -> cộng đích (lỗi) -> bù trừ hoàn trả nguồn
      expect(inventoryClient.send).toHaveBeenCalledTimes(3);
      expect(result.status).toBe(TransactionStatus.FAILED);
      expect(result.note).toContain('Kệ đích [B01] lỗi');
      expect(result.note).toContain('Đã tự động bù trừ hoàn trả về kệ nguồn');
      expect(kafkaProducer.emit).not.toHaveBeenCalled();
    });
  });

  describe('Crash Recovery', () => {
    it('quét và phục hồi thành công các Saga bị treo ở trạng thái COMPENSATING', async () => {
      const stuckSaga: Partial<SagaInstance> = {
        id: 'saga-stuck',
        transactionId: 'tx-stuck',
        sagaType: SagaType.TRANSFER,
        status: SagaStatus.COMPENSATING,
        currentStep: 'COMPENSATE_SOURCE',
        stepLogs: [],
      };

      const stuckTx: Partial<Transaction> = {
        id: 'tx-stuck',
        productId: 'prod-1',
        quantity: 10,
        locationFrom: 'A01',
        locationTo: 'B01',
        status: TransactionStatus.PENDING,
      };

      sagaRepository.find.mockResolvedValue([stuckSaga]);
      transactionRepository.findOne.mockResolvedValue(stuckTx as Transaction);
      inventoryClient.send.mockReturnValue(of({ success: true }));

      const count = await orchestrator.recoverStuckSagas();

      expect(count).toBe(1);
      expect(stuckSaga.status).toBe(SagaStatus.COMPENSATED);
      expect(stuckTx.status).toBe(TransactionStatus.FAILED);
      expect(stuckTx.note).toContain('Đã tự động phục hồi bù trừ sau sự cố');
    });
  });
});
