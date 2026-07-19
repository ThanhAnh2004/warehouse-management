import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

const DEFAULT_WAREHOUSE = 'DEFAULT_WAREHOUSE';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
  ) {}

  async create(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
    this.validateBusinessRules(createTransactionDto);

    // 1. Ghi nhận giao dịch với trạng thái PENDING
    const transaction = this.transactionRepository.create({
      ...createTransactionDto,
      status: TransactionStatus.PENDING,
    });

    const savedTransaction = await this.transactionRepository.save(transaction);

    // 2. Áp dụng thay đổi tồn kho tương ứng sang Inventory Service
    try {
      await this.applyToInventory(savedTransaction);
      savedTransaction.status = TransactionStatus.COMPLETED;
    } catch (error: any) {
      // 3. Nếu có lỗi từ Inventory (ví dụ: kho không đủ), đánh dấu FAILED
      savedTransaction.status = TransactionStatus.FAILED;
      const errorMessage = error?.message || JSON.stringify(error);
      savedTransaction.note = `${savedTransaction.note || ''} | Error: ${errorMessage}`.trim();
    }

    // Cập nhật lại trạng thái cuối cùng
    return this.transactionRepository.save(savedTransaction);
  }

  // Quy tắc nghiệp vụ theo từng loại giao dịch: kiểm tra trước khi ghi bất kỳ dòng nào
  // vào DB, để tránh tạo ra các bản ghi PENDING "rác" từ input sai định dạng.
  private validateBusinessRules(dto: CreateTransactionDto) {
    const { type, quantity, locationFrom, locationTo } = dto;

    if (type === TransactionType.ADJUSTMENT) {
      if (!quantity) {
        throw new RpcException('ADJUSTMENT yêu cầu quantity khác 0 (dương: tăng, âm: giảm tồn kho)');
      }
      if (!locationFrom && !locationTo) {
        throw new RpcException('ADJUSTMENT yêu cầu locationFrom hoặc locationTo');
      }
      return;
    }

    if (!quantity || quantity <= 0) {
      throw new RpcException('quantity phải là số dương với INBOUND/OUTBOUND/TRANSFER');
    }
    if (type === TransactionType.INBOUND && !locationTo) {
      throw new RpcException('INBOUND yêu cầu locationTo');
    }
    if (type === TransactionType.OUTBOUND && !locationFrom) {
      throw new RpcException('OUTBOUND yêu cầu locationFrom');
    }
    if (type === TransactionType.TRANSFER && (!locationFrom || !locationTo)) {
      throw new RpcException('TRANSFER yêu cầu cả locationFrom và locationTo');
    }
  }

  private async updateInventory(productId: string, quantityChange: number, location: string) {
    return firstValueFrom(
      this.inventoryClient.send('inventory.update_stock', { productId, quantityChange, location }),
    );
  }

  private async applyToInventory(tx: Transaction): Promise<void> {
    switch (tx.type) {
      case TransactionType.INBOUND:
        await this.updateInventory(tx.productId, tx.quantity, tx.locationTo || DEFAULT_WAREHOUSE);
        break;

      case TransactionType.OUTBOUND:
        await this.updateInventory(tx.productId, -tx.quantity, tx.locationFrom || DEFAULT_WAREHOUSE);
        break;

      case TransactionType.ADJUSTMENT:
        // quantity mang dấu sẵn: dương = tăng tồn kho thực tế, âm = giảm (hao hụt/kiểm kê)
        await this.updateInventory(tx.productId, tx.quantity, tx.locationTo || tx.locationFrom || DEFAULT_WAREHOUSE);
        break;

      case TransactionType.TRANSFER:
        await this.applyTransfer(tx);
        break;
    }
  }

  private async applyTransfer(tx: Transaction): Promise<void> {
    // Xuất ở kho nguồn trước
    await this.updateInventory(tx.productId, -tx.quantity, tx.locationFrom);

    // Nhập ở kho đích; nếu bước này lỗi (vd kho đích lỗi kết nối), phải hoàn tác
    // lại phần đã xuất ở nguồn - nếu không, hàng sẽ bị "biến mất" khỏi hệ thống
    // (đã trừ ở nguồn nhưng chưa cộng ở đích).
    try {
      await this.updateInventory(tx.productId, tx.quantity, tx.locationTo);
    } catch (destError) {
      try {
        await this.updateInventory(tx.productId, tx.quantity, tx.locationFrom);
      } catch (rollbackError) {
        const destMsg = destError?.message || destError;
        const rollbackMsg = rollbackError?.message || rollbackError;
        throw new Error(
          `Chuyển kho thất bại VÀ hoàn tác thất bại - cần đối soát thủ công. ` +
            `Lỗi ở đích: ${destMsg}; Lỗi hoàn tác nguồn: ${rollbackMsg}`,
        );
      }
      throw destError;
    }
  }

  async findAll(
    payload: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
      type?: string;
      status?: string;
      search?: string;
    } = {},
  ): Promise<{ data: Transaction[]; total: number; page: number; limit: number }> {
    const page = payload.page || 1;
    const limit = payload.limit || 20;
    const sortBy = payload.sortBy || 'createdAt';
    const sortOrder = payload.sortOrder || 'DESC';

    const queryBuilder = this.transactionRepository.createQueryBuilder('tx');

    if (payload.type) {
      queryBuilder.andWhere('tx.type = :type', { type: payload.type });
    }

    if (payload.status) {
      queryBuilder.andWhere('tx.status = :status', { status: payload.status });
    }

    if ((payload as any).startDate) {
      queryBuilder.andWhere('tx.createdAt >= :startDate', { startDate: new Date((payload as any).startDate) });
    }

    if ((payload as any).endDate) {
      const end = new Date((payload as any).endDate);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('tx.createdAt <= :endDate', { endDate: end });
    }

    if (payload.search) {
      const s = `%${payload.search.trim()}%`;
      const searchProductIds = (payload as any).productIds || [];
      if (Array.isArray(searchProductIds) && searchProductIds.length > 0) {
        queryBuilder.andWhere(
          '(tx.note ILIKE :s OR CAST(tx.type AS text) ILIKE :s OR CAST(tx.status AS text) ILIKE :s OR tx.productId IN (:...searchProductIds))',
          { s, searchProductIds }
        );
      } else {
        queryBuilder.andWhere(
          '(tx.note ILIKE :s OR CAST(tx.type AS text) ILIKE :s OR CAST(tx.status AS text) ILIKE :s OR tx.productId ILIKE :s)',
          { s }
        );
      }
    }

    const allowedSortFields = ['createdAt', 'quantity', 'type', 'status', 'updatedAt'];
    const sortField = allowedSortFields.includes(sortBy) ? `tx.${sortBy}` : 'tx.createdAt';

    queryBuilder
      .orderBy(sortField, sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total, page, limit };
  }

  async findByProduct(
    productId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Transaction[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.transactionRepository.findAndCount({
      where: { productId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }
}
