import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PurchaseOrderItem } from './purchase-order-item.entity';

export enum POStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  ORDERED = 'ORDERED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  poNumber: string;

  @Column()
  supplierId: string;

  @Column()
  supplierName: string;

  @Column({
    type: 'enum',
    enum: POStatus,
    default: POStatus.DRAFT,
  })
  status: POStatus;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ nullable: true })
  expectedDeliveryDate: Date;

  @Column({ nullable: true })
  actualReceivedDate: Date;

  @Column({ default: 'CỬA 01 - IN (CẢNG A)' })
  receivingDock: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ default: 'MANUAL' })
  triggerSource: 'MANUAL' | 'AI_AUTO_SUGGESTION';

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, { cascade: true, eager: true })
  items: PurchaseOrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
