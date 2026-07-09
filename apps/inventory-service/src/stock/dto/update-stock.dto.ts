import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class UpdateStockDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @IsNotEmpty()
  quantityChange: number;

  @IsString()
  @IsOptional()
  location?: string;
}
