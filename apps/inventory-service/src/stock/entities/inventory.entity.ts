import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { Location } from './location.entity';

@Entity('inventories')
@Unique(['productId', 'location'])
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @Column({ default: 'Z-STD-A01-R01-S1-A' })
  location: string;

  @Column({ nullable: true })
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'locationId' })
  locationDetails: Location;

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
