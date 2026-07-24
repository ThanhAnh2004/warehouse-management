import { IsString, IsNotEmpty, IsOptional, Matches, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ required: false, example: 'John Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Full name cannot be empty' })
  @IsOptional()
  fullname?: string;

  @ApiProperty({ required: false, example: '123 Main St' })
  @IsString()
  @IsNotEmpty({ message: 'Address cannot be empty' })
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false, example: '0123456789' })
  @IsString()
  @IsNotEmpty({ message: 'Phone cannot be empty' })
  @Matches(/^[0-9]{10,11}$/, { message: 'Phone must be between 10 and 11 digits' })
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false, example: 'Male' })
  @IsString()
  @IsNotEmpty({ message: 'Gender cannot be empty' })
  @IsIn(['Male', 'Female'], { message: 'Gender must be Male or Female' })
  @IsOptional()
  gender?: string;

  @ApiProperty({ required: false, example: 'Staff' })
  @IsString()
  @IsNotEmpty({ message: 'Role cannot be empty' })
  @IsIn(['Staff', 'Manager', 'Admin'], { message: 'Role must be Staff, Manager or Admin' })
  @IsOptional()
  role?: string;

  @ApiProperty({ required: false, type: [String], example: ['products:read'] })
  @IsOptional()
  permissions?: string[];
}
