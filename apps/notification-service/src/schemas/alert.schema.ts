import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AlertDocument = Alert & Document;

@Schema({ timestamps: true })
export class Alert {
  @Prop({ required: true })
  productId: string;

  @Prop({ required: true })
  productName: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: 'LOW_STOCK' })
  alertType: string; // LOW_STOCK | OVERSTOCK

  @Prop()
  currentStock: number;

  @Prop()
  threshold: number;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  createdBy: string;

  @Prop()
  updatedBy: string;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
