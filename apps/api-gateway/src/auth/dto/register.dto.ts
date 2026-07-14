import { IsString, IsNotEmpty, MinLength, IsOptional, IsEmail, Matches, IsIn } from 'class-validator';
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

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Full name cannot be empty' })
  fullname: string;

  @ApiProperty({ required: false, example: 'Manager' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty({ example: '123 Main St' })
  @IsString()
  @IsNotEmpty({ message: 'Address cannot be empty' })
  address: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty({ message: 'Phone cannot be empty' })
  @Matches(/^[0-9]{10,11}$/, { message: 'Phone must be between 10 and 11 digits' })
  phone: string;

  @ApiProperty({ example: 'Male' })
  @IsString()
  @IsNotEmpty({ message: 'Gender cannot be empty' })
  @IsIn(['Male', 'Female'], { message: 'Gender must be Male or Female' })
  gender: string;
}
