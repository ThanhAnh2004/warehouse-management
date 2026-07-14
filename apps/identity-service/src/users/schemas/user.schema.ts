import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true }) // Tự động thêm createdAt và updatedAt
export class User {
  @Prop({ required: true, unique: true })
  email: string; // Sử dụng email làm username

  @Prop({ required: true })
  password: string; // Đã được hash bằng bcrypt

  @Prop()
  fullname: string;

  @Prop({ default: 'Staff' })
  role: string;

  @Prop()
  address: string;

  @Prop()
  phone: string;

  @Prop()
  gender: string;

  @Prop()
  createdBy: string;

  @Prop()
  updatedBy: string;

  @Prop()
  refreshToken: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
