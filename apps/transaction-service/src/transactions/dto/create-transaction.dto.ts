export class CreateTransactionDto {
  type: string;
  productId: string;
  quantity: number;
  locationFrom?: string;
  locationTo?: string;
  note?: string;
  createdBy?: string;
}
