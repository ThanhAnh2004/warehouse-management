import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { Alert, AlertDocument } from '../schemas/alert.schema';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter;

  constructor(@InjectModel(Alert.name) private alertModel: Model<AlertDocument>) {
    // Sử dụng Ethereal Email cho mục đích test
    this.transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'reva.lang@ethereal.email',
        pass: 'sAteC6VnUjBvV3eUuK'
      }
    });

    // Tạo test account tự động cho chuẩn
    nodemailer.createTestAccount().then(account => {
      this.transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
          user: account.user,
          pass: account.pass,
        },
      });
      this.logger.log(`Ethereal Email initialized. User: ${account.user}`);
    });
  }

  async checkAndCreateAlert(payload: { productId: string, productName: string, newStock: number, eoq?: number }) {
    this.logger.log(`Received stock change for ${payload.productName}: new stock = ${payload.newStock}`);
    // Inventory Service already decided this crossed the product's EOQ reorder threshold
    // before emitting this event; fall back to 20 only if an older caller omits eoq.
    const threshold = payload.eoq ?? 20;
    if (payload.newStock < threshold) {
      this.logger.warn(`Stock for ${payload.productName} is below EOQ threshold (${threshold})! Creating alert.`);
      const newAlert = new this.alertModel({
        productId: payload.productId,
        productName: payload.productName,
        message: `Sản phẩm ${payload.productName} tồn kho (${payload.newStock}) đã xuống dưới ngưỡng đặt hàng lại EOQ (${threshold})!`,
      });
      await newAlert.save();
      await this.sendLowStockAlertEmail(payload.productName, payload.newStock, threshold);
    }
  }

  async sendLowStockAlertEmail(productName: string, currentQuantity: number, eoqThreshold: number) {
    const mailOptions = {
      from: '"Warehouse System" <alert@warehouse.local>',
      to: 'manager@gmail.com',
      subject: '🚨 CẢNH BÁO TỒN KHO DƯỚI NGƯỠNG EOQ',
      text: `Sản phẩm: ${productName} hiện đang có tồn kho dưới ngưỡng đặt hàng lại (EOQ).\nSố lượng hiện tại: ${currentQuantity}.\nNgưỡng EOQ: ${eoqThreshold}.\nVui lòng nhập thêm hàng ngay!`,
      html: `<h3>🚨 CẢNH BÁO TỒN KHO DƯỚI NGƯỠNG EOQ</h3>
             <p>Sản phẩm: <b>${productName}</b> hiện đang có tồn kho dưới ngưỡng đặt hàng lại (EOQ).</p>
             <p>Số lượng hiện tại: <b style="color:red">${currentQuantity}</b> (ngưỡng EOQ: <b>${eoqThreshold}</b>)</p>
             <p>Vui lòng nhập thêm hàng ngay!</p>`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Đã gửi email cảnh báo! Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    } catch (error) {
      this.logger.error('Lỗi khi gửi email', error);
    }
  }

  async getAlerts() {
    return this.alertModel.find().sort({ createdAt: -1 }).limit(50).exec();
  }

  async markAsRead(id: string) {
    return this.alertModel.findByIdAndUpdate(id, { isRead: true }, { new: true }).exec();
  }
}
