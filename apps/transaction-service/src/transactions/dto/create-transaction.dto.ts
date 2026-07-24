import { IsEnum, IsString, IsNotEmpty, IsInt, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../entities/transaction.entity';

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.INBOUND })
  @IsEnum(TransactionType, {
    message: 'type phải là một trong: INBOUND, OUTBOUND, TRANSFER, ADJUSTMENT',
  })
  type!: TransactionType;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({
    example: 10,
    description:
      'Số dương với INBOUND/OUTBOUND/TRANSFER; có thể âm/dương với ADJUSTMENT (tăng/giảm tồn kho thực tế)',
  })
  @IsInt()
  quantity!: number;

  @ApiPropertyOptional({ example: 'WAREHOUSE_A' })
  @IsString()
  @IsOptional()
  locationFrom?: string;

  @ApiPropertyOptional({ example: 'WAREHOUSE_B' })
  @IsString()
  @IsOptional()
  locationTo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  createdBy?: string;
}
