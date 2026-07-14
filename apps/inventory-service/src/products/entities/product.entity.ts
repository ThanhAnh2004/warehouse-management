import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sku: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  price: number;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  unit: string;

  @Column({ nullable: true })
  imageUrl: string;

  // EOQ inputs (Economic Order Quantity) - optional per-product overrides; sensible defaults are
  // applied in StockService when not set so existing products keep working without migration.
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  orderingCost: number; // S: cost per purchase order (VND)

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  holdingCostRate: number; // H rate: annual holding cost as a fraction of unit price (e.g. 0.2 = 20%/year)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;
}
