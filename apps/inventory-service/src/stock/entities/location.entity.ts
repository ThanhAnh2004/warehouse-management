import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ZoneType {
  HIGH_VAL = 'ZONE-HIGH-VAL',               // Hàng giá trị cao (Laptop, Smartphone, Tablet, Drone)
  LARGE_APPLIANCE = 'ZONE-LARGE-APPLIANCE', // Thiết bị điện tử cỡ lớn (Smart TV, Loa, Máy chiếu)
  ACCESSORIES = 'ZONE-ACCESSORIES',         // Linh kiện & Phụ kiện (Bàn phím, Chuột, Tai nghe, RAM/SSD)
  ESD_TEMP = 'ZONE-ESD-TEMP',               // Chống tĩnh điện & Nhiệt độ (Chipset, Bo mạch, Sensor)
}

export enum LocationStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  FULL = 'FULL',
}

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // Mã Kệ đơn giản: A01, A02, B01, C01, D01...

  @Column({ type: 'varchar', default: ZoneType.ACCESSORIES })
  zone: string; // ZONE-HIGH-VAL, ZONE-LARGE-APPLIANCE, ZONE-ACCESSORIES, ZONE-ESD-TEMP

  @Column({ default: 'A' })
  aisle: string; // Dãy kệ (Dãy A, Dãy B, Dãy C, Dãy D)

  @Column({ type: 'int', default: 500 })
  maxCapacity: number; // Sức chứa tối đa (số đơn vị sản phẩm)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1000.00 })
  maxWeightKg: number; // Tải trọng tối đa (kg)

  @Column({ type: 'varchar', default: LocationStatus.ACTIVE })
  status: string; // ACTIVE, MAINTENANCE, FULL

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
