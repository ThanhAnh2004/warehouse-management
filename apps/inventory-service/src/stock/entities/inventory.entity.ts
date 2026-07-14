import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('inventories')
@Unique(['productId', 'location'])
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
