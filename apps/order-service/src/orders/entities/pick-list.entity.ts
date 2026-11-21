import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PickListItem } from './pick-list-item.entity';

export enum PickListStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('pick_lists')
export class PickList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column()
  orderNumber: string;

  @Column({ nullable: true })
  pickerName: string;

  @Column({
    type: 'enum',
    enum: PickListStatus,
    default: PickListStatus.PENDING,
  })
  status: PickListStatus;

  @OneToMany(() => PickListItem, (item) => item.pickList, { cascade: true, eager: true })
  items: PickListItem[];

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
