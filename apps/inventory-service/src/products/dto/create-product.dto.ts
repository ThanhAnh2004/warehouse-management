import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsOptional()
  orderingCost?: number;

  @IsOptional()
  holdingCostRate?: number;

  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  createdBy?: string;

  @IsString()
  @IsOptional()
  updatedBy?: string;

  @IsOptional()
  minStockLevel: number;

  @IsOptional()
  maxStockLevel?: number;
}
