import { OrderType } from '../entities/order.entity';

export class CreateOrderItemDto {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export class CreateOrderDto {
  customerName: string;
  customerPhone?: string;
  shippingAddress?: string;
  orderType?: OrderType;
  priority?: 'HIGH' | 'NORMAL';
  shippingFee?: number;
  notes?: string;
  items: CreateOrderItemDto[];
}
