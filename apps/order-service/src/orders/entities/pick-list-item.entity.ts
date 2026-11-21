import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PickList } from './pick-list.entity';

@Entity('pick_list_items')
export class PickListItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pickListId: string;

  @ManyToOne(() => PickList, (pl) => pl.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pickListId' })
  pickList: PickList;

  @Column()
  productId: string;

  @Column()
  productName: string;

  @Column()
  sku: string;

  @Column({ default: 'A01' })
  locationCode: string;

  @Column({ default: 'Khu Nhặt Hàng Nhanh' })
  zone: string;

  @Column({ type: 'int' })
  quantityToPick: number;

  @Column({ type: 'int', default: 0 })
  pickedQuantity: number;

  @Column({ type: 'text', nullable: true })
  serialNumbers: string;

  @Column({ default: false })
  isPicked: boolean;
}
