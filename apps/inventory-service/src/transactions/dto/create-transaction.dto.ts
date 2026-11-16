import { TransactionType } from '../entities/transaction.entity';

export class CreateTransactionDto {
  type: TransactionType;
  productId: string;
  quantity: number;
  locationFrom?: string;
  locationTo?: string;
  createdBy?: string;
  note?: string;
}
