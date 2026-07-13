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
      // 4. Nếu có lỗi từ Inventory (ví dụ: kho không đủ), đánh dấu FAILED
      savedTransaction.status = TransactionStatus.FAILED;
      savedTransaction.note = (savedTransaction.note || '') + ' | Error: ' + (error.message || JSON.stringify(error));
    }

    // Cập nhật lại trạng thái cuối cùng
    return this.transactionRepository.save(savedTransaction);
  }

  async findAll(): Promise<Transaction[]> {
    return this.transactionRepository.find({
      order: { createdAt: 'DESC' }
    });
  }

  async findByProduct(productId: string): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { productId },
      order: { createdAt: 'DESC' }
    });
  }
}
