import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  ALLOCATED = 'ALLOCATED',
  PICKING = 'PICKING',
  PACKED = 'PACKED',
  DISPATCHED = 'DISPATCHED',
  CANCELLED = 'CANCELLED',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export enum OrderType {
  RETAIL_ONLINE = 'RETAIL_ONLINE',
  STORE_TRANSFER = 'STORE_TRANSFER',
  WARRANTY_DISPATCH = 'WARRANTY_DISPATCH',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderNumber: string;

  @Column()
  customerName: string;

  @Column({ nullable: true })
  customerPhone: string;

  @Column({ nullable: true })
  shippingAddress: string;

  @Column({
    type: 'enum',
    enum: OrderType,
    default: OrderType.RETAIL_ONLINE,
  })
  orderType: OrderType;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ default: 'NORMAL' })
  priority: 'HIGH' | 'NORMAL';

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 50000, nullable: true })
  shippingFee: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ nullable: true })
  notes: string;

  @Column({ type: 'jsonb', nullable: true })
  sagaTrace: any[];

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
