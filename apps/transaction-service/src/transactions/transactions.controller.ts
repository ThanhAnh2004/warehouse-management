import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Controller()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @MessagePattern('transaction.create')
  create(@Payload() createTransactionDto: CreateTransactionDto) {
    return this.transactionsService.create(createTransactionDto);
  }

  @MessagePattern('transaction.findAll')
  findAll(@Payload() payload: { page?: number; limit?: number; sortBy?: string; sortOrder?: 'ASC' | 'DESC'; search?: string; type?: string; status?: string } = {}) {
    return this.transactionsService.findAll(payload);
  }

  @MessagePattern('transaction.findByProduct')
  findByProduct(@Payload() payload: { productId: string; page?: number; limit?: number }) {
    return this.transactionsService.findByProduct(payload.productId, payload?.page, payload?.limit);
  }
}
