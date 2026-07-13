import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('inventories')
@Unique(['productId', 'location']) // Ensure one inventory record per product per location
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Storing as string since we don't necessarily have foreign key constraint across different DBs/services
  // If products and inventories are in the same DB, we could use @ManyToOne. But string is safer for microservices.
  @Column()
  productId: string;

  @Column({ default: 'DEFAULT_WAREHOUSE' })
  location: string;

  @Column({ type: 'int', default: 0 })
  currentQuantity: number;

  @Column({ type: 'int', default: 0 })
  reservedQuantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;
}
