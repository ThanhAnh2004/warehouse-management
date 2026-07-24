import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { TransactionsService } from './transactions.service';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let inventoryClient: { send: jest.Mock };
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
  };

  const buildDto = (overrides: Partial<CreateTransactionDto> = {}): CreateTransactionDto => ({
    type: TransactionType.INBOUND,
    productId: 'prod-1',
    quantity: 10,
    locationTo: 'WH_A',
    ...overrides,
  });

  beforeEach(async () => {
    repository = {
      // Trả về chính input để service.create() thấy transaction "vừa lưu" như mong đợi
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 'tx-1', ...entity })),
      findAndCount: jest.fn(),
    };
    inventoryClient = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: repository },
        { provide: 'INVENTORY_SERVICE', useValue: inventoryClient },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate business rules trước khi ghi DB', () => {
    it('từ chối OUTBOUND thiếu locationFrom và không lưu gì vào DB', async () => {
      const dto = buildDto({ type: TransactionType.OUTBOUND, locationTo: undefined });
      await expect(service.create(dto)).rejects.toThrow(RpcException);
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('từ chối TRANSFER thiếu locationTo', async () => {
      const dto = buildDto({ type: TransactionType.TRANSFER, locationFrom: 'WH_A', locationTo: undefined });
      await expect(service.create(dto)).rejects.toThrow(RpcException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('từ chối quantity <= 0 với INBOUND', async () => {
      const dto = buildDto({ quantity: 0 });
      await expect(service.create(dto)).rejects.toThrow(RpcException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('từ chối ADJUSTMENT với quantity = 0', async () => {
      const dto = buildDto({ type: TransactionType.ADJUSTMENT, quantity: 0, locationTo: 'WH_A' });
      await expect(service.create(dto)).rejects.toThrow(RpcException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('từ chối ADJUSTMENT thiếu cả locationFrom lẫn locationTo', async () => {
      const dto = buildDto({ type: TransactionType.ADJUSTMENT, quantity: -5, locationTo: undefined });
      await expect(service.create(dto)).rejects.toThrow(RpcException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('chấp nhận ADJUSTMENT với quantity âm (giảm tồn kho)', async () => {
      inventoryClient.send.mockReturnValue(of({ currentQuantity: 5 }));
      const dto = buildDto({ type: TransactionType.ADJUSTMENT, quantity: -5, locationTo: 'WH_A' });

      const result = await service.create(dto);

      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(inventoryClient.send).toHaveBeenCalledWith('inventory.update_stock', {
        productId: 'prod-1',
        quantityChange: -5,
        location: 'WH_A',
      });
    });
  });

  describe('INBOUND / OUTBOUND', () => {
    it('INBOUND thành công -> COMPLETED, cộng đúng dấu vào locationTo', async () => {
      inventoryClient.send.mockReturnValue(of({ currentQuantity: 20 }));

      const result = await service.create(buildDto());

      expect(inventoryClient.send).toHaveBeenCalledTimes(1);
      expect(inventoryClient.send).toHaveBeenCalledWith('inventory.update_stock', {
        productId: 'prod-1',
        quantityChange: 10,
        location: 'WH_A',
      });
      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('OUTBOUND thiếu tồn kho -> FAILED, note chứa lỗi từ Inventory Service', async () => {
      inventoryClient.send.mockReturnValue(throwError(() => new RpcException('Insufficient stock')));

      const dto = buildDto({ type: TransactionType.OUTBOUND, locationTo: undefined, locationFrom: 'WH_A' });
      const result = await service.create(dto);

      expect(result.status).toBe(TransactionStatus.FAILED);
      expect(result.note).toContain('Insufficient stock');
    });
  });

  describe('TRANSFER', () => {
    it('thành công -> gọi đúng 2 lần (trừ nguồn, cộng đích), COMPLETED', async () => {
      inventoryClient.send.mockReturnValue(of({ currentQuantity: 100 }));

      const dto = buildDto({
        type: TransactionType.TRANSFER,
        locationFrom: 'WH_A',
        locationTo: 'WH_B',
        quantity: 30,
      });
      const result = await service.create(dto);

      expect(inventoryClient.send).toHaveBeenCalledTimes(2);
      expect(inventoryClient.send).toHaveBeenNthCalledWith(1, 'inventory.update_stock', {
        productId: 'prod-1',
        quantityChange: -30,
        location: 'WH_A',
      });
      expect(inventoryClient.send).toHaveBeenNthCalledWith(2, 'inventory.update_stock', {
        productId: 'prod-1',
        quantityChange: 30,
        location: 'WH_B',
      });
      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('đích lỗi -> tự động hoàn tác (rollback) nguồn, đánh dấu FAILED', async () => {
      inventoryClient.send
        .mockReturnValueOnce(of({ currentQuantity: 70 })) // 1. trừ nguồn: OK
        .mockReturnValueOnce(throwError(() => new RpcException('Kho đích không khả dụng'))) // 2. cộng đích: lỗi
        .mockReturnValueOnce(of({ currentQuantity: 100 })); // 3. rollback nguồn: OK

      const dto = buildDto({
        type: TransactionType.TRANSFER,
        locationFrom: 'WH_A',
        locationTo: 'WH_B',
        quantity: 30,
      });
      const result = await service.create(dto);

      expect(inventoryClient.send).toHaveBeenCalledTimes(3);
      // Lần rollback (thứ 3) phải cộng trả lại đúng số lượng đã trừ ở nguồn
      expect(inventoryClient.send).toHaveBeenNthCalledWith(3, 'inventory.update_stock', {
        productId: 'prod-1',
        quantityChange: 30,
        location: 'WH_A',
      });
      expect(result.status).toBe(TransactionStatus.FAILED);
      expect(result.note).toContain('Kho đích không khả dụng');
    });

    it('đích lỗi VÀ rollback cũng lỗi -> FAILED với message cảnh báo đối soát thủ công', async () => {
      inventoryClient.send
        .mockReturnValueOnce(of({ currentQuantity: 70 })) // 1. trừ nguồn: OK
        .mockReturnValueOnce(throwError(() => new RpcException('Kho đích không khả dụng'))) // 2. cộng đích: lỗi
        .mockReturnValueOnce(throwError(() => new RpcException('Mất kết nối Inventory Service'))); // 3. rollback: lỗi

      const dto = buildDto({
        type: TransactionType.TRANSFER,
        locationFrom: 'WH_A',
        locationTo: 'WH_B',
        quantity: 30,
      });
      const result = await service.create(dto);

      expect(inventoryClient.send).toHaveBeenCalledTimes(3);
      expect(result.status).toBe(TransactionStatus.FAILED);
      expect(result.note).toContain('đối soát thủ công');
      expect(result.note).toContain('Kho đích không khả dụng');
      expect(result.note).toContain('Mất kết nối Inventory Service');
    });
  });

  describe('phân trang', () => {
    it('findAll dùng đúng skip/take theo page/limit và trả kèm total', async () => {
      repository.findAndCount.mockResolvedValue([[{ id: 'tx-1' }], 42]);

      const result = await service.findAll(2, 10);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 10,
        take: 10,
      });
      expect(result).toEqual({ data: [{ id: 'tx-1' }], total: 42, page: 2, limit: 10 });
    });

    it('findByProduct lọc theo productId và áp dụng phân trang', async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findByProduct('prod-1', 1, 20);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });
  });
});
