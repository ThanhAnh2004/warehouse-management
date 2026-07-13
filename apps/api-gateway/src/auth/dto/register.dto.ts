import { IsString, IsNotEmpty, MinLength, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'admin@gmail.com' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  @IsNotEmpty({ message: 'Email cannot be empty' })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({ required: false, example: 'John Doe' })
  @IsString()
  @IsOptional()
  fullname?: string;

  @ApiProperty({ required: false, example: 'Manager' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty({ required: false, example: '123 Main St' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false, example: '0123456789' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false, example: 'Male' })
  @IsString()
  @IsOptional()
  gender?: string;
}
