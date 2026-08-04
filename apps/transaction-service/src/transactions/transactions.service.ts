import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

const DEFAULT_WAREHOUSE = 'DEFAULT_WAREHOUSE';

@Injectable()
export class TransactionsService implements OnModuleInit {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
  ) {}

  async onModuleInit() {
    setTimeout(() => {
      this.seedHistoricalTransactions();
    }, 4000);
  }

  async seedHistoricalTransactions() {
    try {
      const count = await this.transactionRepository.count();
      if (count >= 100) {
        this.logger.log(`Skipping transactions seed, DB already has ${count} transaction records.`);
        return;
      }

      this.logger.log('Fetching products to seed historical OUTBOUND transactions for AI Forecasting & EOQ...');
      const res: any = await firstValueFrom(
        this.inventoryClient.send('product.find_all', { limit: 100 })
      );

      const products = res?.data || [];
      if (products.length === 0) {
        this.logger.warn('No products found to seed transactions for.');
        return;
      }

      const locations = ['A01', 'A02', 'A03', 'A04', 'B01', 'B02', 'C01', 'D01'];
      const now = new Date();
      const transactionsToSave: Transaction[] = [];

      for (const prod of products) {
        const prodId = prod.id;
        const loc = prod.location || locations[Math.floor(Math.random() * locations.length)];

        // 1. Baseline INBOUND transaction 60 days ago
        const inboundDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const inboundTx = this.transactionRepository.create({
          productId: prodId,
          type: TransactionType.INBOUND,
          quantity: 300,
          locationTo: loc,
          status: TransactionStatus.COMPLETED,
          createdBy: 'seed',
          note: 'Nhập kho ban đầu từ đại lý phân phối',
          createdAt: inboundDate,
        });
        transactionsToSave.push(inboundTx);

        // 2. Generate 18 OUTBOUND sales transactions spread across past 45 days
        const numOutbound = 18;
        for (let i = 1; i <= numOutbound; i++) {
          const daysAgo = Math.max(0.5, (45 - (i * (45 / numOutbound))) + (Math.random() * 1.5 - 0.75));
          const txDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
          
          // Realistic daily sales quantity depending on price
          const price = Number(prod.price || 0);
          const baseQty = price > 30000000 
            ? Math.floor(Math.random() * 3) + 1 
            : price > 10000000 
            ? Math.floor(Math.random() * 5) + 2 
            : Math.floor(Math.random() * 10) + 4;

          const outTx = this.transactionRepository.create({
            productId: prodId,
            type: TransactionType.OUTBOUND,
            quantity: baseQty,
            locationFrom: loc,
            status: TransactionStatus.COMPLETED,
            createdBy: 'seed',
            note: `Xuất kho bán lẻ siêu thị điện máy #${Math.floor(100000 + Math.random() * 900000)}`,
            createdAt: txDate,
          });
          transactionsToSave.push(outTx);
        }
      }

      await this.transactionRepository.save(transactionsToSave);
      this.logger.log(`Successfully seeded ${transactionsToSave.length} historical transactions into PostgreSQL DB.`);
    } catch (err: any) {
      this.logger.warn(`Failed to seed historical transactions: ${err.message}`);
    }
  }

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
    if (type === TransactionType.INBOUND) {
      dto.locationTo = DEFAULT_WAREHOUSE;
    }
    if (type === TransactionType.OUTBOUND && !locationFrom) {
      throw new RpcException('OUTBOUND yêu cầu Từ Kệ Kho (locationFrom)');
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
        await this.updateInventory(tx.productId, tx.quantity, tx.locationTo || tx.locationFrom || DEFAULT_WAREHOUSE);
        break;

      case TransactionType.TRANSFER:
        await this.applyTransfer(tx);
        break;
    }
  }

  private async applyTransfer(tx: Transaction): Promise<void> {
    await this.updateInventory(tx.productId, -tx.quantity, tx.locationFrom);

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

  async update(id: string, dto: { quantity?: number; note?: string }): Promise<Transaction> {
    const tx = await this.transactionRepository.findOne({ where: { id } });
    if (!tx) throw new RpcException('Không tìm thấy giao dịch.');

    if (dto.quantity !== undefined && dto.quantity !== tx.quantity) {
      const diff = dto.quantity - tx.quantity;
      tx.quantity = dto.quantity;
      await this.updateInventory(tx.productId, diff, tx.locationTo || tx.locationFrom || DEFAULT_WAREHOUSE);
    }

    if (dto.note !== undefined) {
      tx.note = dto.note;
    }

    return this.transactionRepository.save(tx);
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const tx = await this.transactionRepository.findOne({ where: { id } });
    if (!tx) throw new RpcException('Không tìm thấy giao dịch.');

    try {
      if (tx.type === TransactionType.INBOUND) {
        await this.updateInventory(tx.productId, -tx.quantity, tx.locationTo || DEFAULT_WAREHOUSE);
      } else if (tx.type === TransactionType.OUTBOUND) {
        await this.updateInventory(tx.productId, tx.quantity, tx.locationFrom || DEFAULT_WAREHOUSE);
      } else if (tx.type === TransactionType.ADJUSTMENT) {
        await this.updateInventory(tx.productId, -tx.quantity, tx.locationTo || tx.locationFrom || DEFAULT_WAREHOUSE);
      }
    } catch (e: any) {
      this.logger.warn(`Could not revert inventory for deleted transaction ${id}: ${e?.message}`);
    }

    await this.transactionRepository.remove(tx);
    return { success: true, message: 'Đã xóa giao dịch thành công.' };
  }
}
