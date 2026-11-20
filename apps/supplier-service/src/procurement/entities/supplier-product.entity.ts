import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Supplier } from './supplier.entity';

@Entity('supplier_products')
export class SupplierProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  supplierId: string;

  @Column()
  productId: string;

  @Column()
  productSku: string;

  @Column()
  productName: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  supplyPrice: number;

  @Column({ default: 3 })
  leadTimeDays: number;

  @Column({ default: 5 })
  minOrderQty: number;

  @Column({ default: true })
  isPreferred: boolean;

  @ManyToOne(() => Supplier, (supplier) => supplier.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;
}
