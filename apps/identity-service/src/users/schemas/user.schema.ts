import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true }) // Tự động thêm createdAt và updatedAt
export class User {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  password: string; // Đã được hash bằng bcrypt

  @Prop()
  fullName: string;

  @Prop({ default: 'Staff' })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
