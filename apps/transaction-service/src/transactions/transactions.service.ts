import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
  ) {}

  async create(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
    // 1. Ghi nhận giao dịch với trạng thái PENDING
    const transaction = this.transactionRepository.create({
      ...createTransactionDto,
      type: createTransactionDto.type as TransactionType,
      status: TransactionStatus.PENDING,
    });
    
    let savedTransaction = await this.transactionRepository.save(transaction);

    // 2. Gửi request cập nhật kho sang Inventory Service
    // Đối với INBOUND: quantityChange dương, locationTo
    // Đối với OUTBOUND: quantityChange âm, locationFrom
    // Đối với TRANSFER: Cần thực hiện 2 thao tác (xuất nguồn, nhập đích). Tạm thời đơn giản hóa.
    try {
      if (savedTransaction.type === TransactionType.INBOUND) {
        await firstValueFrom(
          this.inventoryClient.send('inventory.update_stock', {
            productId: savedTransaction.productId,
            quantityChange: savedTransaction.quantity,
            location: savedTransaction.locationTo || 'DEFAULT_WAREHOUSE',
          })
        );
      } else if (savedTransaction.type === TransactionType.OUTBOUND) {
        await firstValueFrom(
          this.inventoryClient.send('inventory.update_stock', {
            productId: savedTransaction.productId,
            quantityChange: -savedTransaction.quantity,
            location: savedTransaction.locationFrom || 'DEFAULT_WAREHOUSE',
          })
        );
      } else if (savedTransaction.type === TransactionType.TRANSFER) {
        // Xuất ở kho nguồn
        await firstValueFrom(
          this.inventoryClient.send('inventory.update_stock', {
            productId: savedTransaction.productId,
            quantityChange: -savedTransaction.quantity,
            location: savedTransaction.locationFrom,
          })
        );
        // Nhập ở kho đích
        await firstValueFrom(
          this.inventoryClient.send('inventory.update_stock', {
            productId: savedTransaction.productId,
            quantityChange: savedTransaction.quantity,
            location: savedTransaction.locationTo,
          })
        );
      }

      // 3. Nếu thành công, đánh dấu COMPLETED
      savedTransaction.status = TransactionStatus.COMPLETED;
    } catch (error) {
      // Rollback: Xóa transaction PENDING để không lưu rác vào database khi gặp lỗi
      await this.transactionRepository.remove(savedTransaction);
      throw new RpcException(error.message || 'Transaction failed');
    }

    // Cập nhật lại trạng thái cuối cùng
    return this.transactionRepository.save(savedTransaction);
  }

  async findAll(params: {
    productId?: string;
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<{ data: Transaction[]; total: number }> {
    const { productId, page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'DESC' } = params;

    const query = this.transactionRepository.createQueryBuilder('t');

    if (productId) {
      query.andWhere('t.productId = :productId', { productId });
    }

    if (search) {
      let productIds: string[] = [];
      try {
        const prodRes = await firstValueFrom(
          this.inventoryClient.send('product.find_all', { search, limit: 1000 })
        );
        if (prodRes && Array.isArray(prodRes.data)) {
          productIds = prodRes.data.map(p => p.id);
        }
      } catch (e) {
        // Fallback
      }

      if (productIds.length > 0) {
        query.andWhere(
          '(CAST(t.type AS varchar) ILIKE :search OR CAST(t.status AS varchar) ILIKE :search OR t.note ILIKE :search OR t.productId IN (:...productIds))',
          { search: `%${search}%`, productIds }
        );
      } else {
        query.andWhere(
          '(CAST(t.type AS varchar) ILIKE :search OR CAST(t.status AS varchar) ILIKE :search OR t.note ILIKE :search OR CAST(t.productId AS varchar) ILIKE :search)',
          { search: `%${search}%` }
        );
      }
    }

    // Sort mapping
    const allowedSortFields = ['createdAt', 'quantity', 'type', 'status'];
    const actualSortBy = allowedSortFields.includes(sortBy) ? `t.${sortBy}` : 't.createdAt';
    const actualSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    query.orderBy(actualSortBy, actualSortOrder);

    // Pagination
    const skip = (page - 1) * limit;
    query.skip(skip).take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total };
  }

  async findByProduct(productId: string): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { productId },
      order: { createdAt: 'DESC' }
    });
  }
}
