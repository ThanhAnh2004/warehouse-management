import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ZoneType {
  HIGH_VAL = 'ZONE-HIGH-VAL',               // Hàng công nghệ giá trị cao (TGDD: Smartphone, Laptop, Tablet, Smartwatch)
  LARGE_APPLIANCE = 'ZONE-LARGE-APPLIANCE', // Điện máy & Điện lạnh cỡ lớn (ĐMX: Smart TV, Tủ lạnh, Máy giặt, Điều hòa)
  ACCESSORIES = 'ZONE-ACCESSORIES',         // Phụ kiện bán nhanh & Linh kiện (Cáp sạc, Củ sạc nhanh, Tai nghe, Chuột, Bàn phím)
  SERVICE_RMA = 'ZONE-SERVICE-RMA',         // Khu Kỹ Thuật, Thẩm Định Bảo Hành, Đổi Trả 30 Ngày & Hàng Mở Hộp (RMA, Open-Box)
  ESD_TEMP = 'ZONE-SERVICE-RMA',            // Backward compatibility alias cho ESD cũ
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
  code: string; // Mã Tầng Kệ: A1-L1, A1-L2, B1-L1, C1-L1, D1-L1...

  @Column({ type: 'varchar', default: ZoneType.ACCESSORIES })
  zone: string; // ZONE-HIGH-VAL, ZONE-LARGE-APPLIANCE, ZONE-ACCESSORIES, ZONE-SERVICE-RMA

  @Column({ default: 'A' })
  aisle: string; // Dãy A, Dãy B, Dãy C, Dãy D

  @Column({ type: 'varchar', nullable: true, default: 'Kệ A1' })
  rack: string; // Tên Kệ: Kệ A1, Kệ A2, Kệ B1, Kệ B2, Kệ C1, Kệ D1...

  @Column({ type: 'int', default: 1 })
  shelfLevel: number; // Tầng số: 1, 2, 3...

  @Column({ type: 'int', default: 500 })
  maxCapacity: number; // Sức chứa tối đa (số đơn vị sản phẩm trên tầng này)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1000.00 })
  maxWeightKg: number; // Tải trọng tối đa của tầng này (kg)

  @Column({ type: 'varchar', default: LocationStatus.ACTIVE })
  status: string; // ACTIVE, MAINTENANCE, FULL

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
