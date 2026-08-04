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

  // Ngưỡng mặc định nếu Inventory Service không gửi kèm threshold trong payload
  private readonly DEFAULT_THRESHOLD = 20;
  // Khoảng thời gian (ms) không tạo lại cảnh báo trùng cho cùng 1 sản phẩm (chống spam email)
  private readonly DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 giờ

  async checkAndCreateAlert(payload: { productId: string, productName: string, newStock: number, threshold?: number, alertType?: string }) {
    const threshold = payload.threshold ?? this.DEFAULT_THRESHOLD;
    const alertType = payload.alertType === 'OVERSTOCK' ? 'OVERSTOCK' : 'LOW_STOCK';
    const isLow = alertType === 'LOW_STOCK';
    this.logger.log(`Received stock change for ${payload.productName}: type=${alertType}, stock=${payload.newStock}, threshold=${threshold}`);

    // Inventory Service đã lọc theo ngưỡng của từng sản phẩm trước khi bắn event,
    // ở đây vẫn kiểm tra lại theo đúng ngưỡng động (không hard-code 20) để phòng thủ.
    if (isLow && payload.newStock >= threshold) return;
    if (!isLow && payload.newStock <= threshold) return;

    // Chống spam: nếu đã có cảnh báo CÙNG LOẠI, CHƯA ĐỌC cho sản phẩm này trong
    // DEDUP_WINDOW gần đây thì bỏ qua, tránh tạo document + gửi email trùng lặp.
    const since = new Date(Date.now() - this.DEDUP_WINDOW_MS);
    const existingAlert = await this.alertModel.findOne({
      productId: payload.productId,
      alertType,
      isRead: false,
      createdAt: { $gte: since },
    }).exec();

    if (existingAlert) {
      this.logger.log(`Skip duplicate ${alertType} alert for ${payload.productName} (unread alert already exists).`);
      return;
    }

    const message = isLow
      ? `Sản phẩm ${payload.productName} đã giảm xuống dưới mức tồn kho tối thiểu (Hiện tại: ${payload.newStock} / Tối thiểu: ${threshold}).`
      : `Sản phẩm ${payload.productName} đã vượt quá mức tồn kho tối đa (Hiện tại: ${payload.newStock} / Tối đa: ${threshold}).`;

    this.logger.warn(`${alertType} for ${payload.productName} (stock=${payload.newStock}, threshold=${threshold})! Creating alert.`);
    const newAlert = new this.alertModel({
      productId: payload.productId,
      productName: payload.productName,
      alertType,
      currentStock: payload.newStock,
      threshold,
      message,
    });
    await newAlert.save();
    await this.sendStockAlertEmail(alertType, payload.productName, payload.newStock, threshold);
  }

  async sendStockAlertEmail(alertType: string, productName: string, currentQuantity: number, threshold?: number) {
    const isLow = alertType !== 'OVERSTOCK';
    const thresholdText = threshold !== undefined ? ` (Ngưỡng: ${threshold})` : '';
    const subject = isLow ? '🚨 CẢNH BÁO THIẾU TỒN KHO' : '📦 CẢNH BÁO VƯỢT TỒN KHO';
    const headline = isLow
      ? `Sản phẩm: ${productName} hiện tại đang thiếu tồn kho nghiêm trọng.`
      : `Sản phẩm: ${productName} đã vượt quá số lượng tồn kho cho phép.`;
    const action = isLow ? 'Vui lòng tiến hành nhập thêm hàng ngay lập tức!' : 'Cần xem xét chương trình xả hàng hoặc ngưng nhập thêm.';
    const color = isLow ? 'red' : '#d97706';

    const mailOptions = {
      from: '"Hệ thống Quản lý Kho" <alert@warehouse.local>',
      to: 'manager@gmail.com',
      subject,
      text: `${headline}\nSố lượng hiện tại: ${currentQuantity}${thresholdText}.\n${action}`,
      html: `<h3>${subject}</h3>
             <p>${headline}</p>
             <p>Số lượng hiện tại: <b style="color:${color}">${currentQuantity}</b>${thresholdText}</p>
             <p><b>${action}</b></p>`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`${alertType} email alert sent! Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    } catch (error) {
      this.logger.error('Error sending email', error);
    }
  }

  async getAlerts() {
    return this.alertModel.find().sort({ createdAt: -1 }).limit(50).exec();
  }

  async markAsRead(id: string) {
    return this.alertModel.findByIdAndUpdate(id, { isRead: true }, { new: true }).exec();
  }

  async deleteAlert(id: string) {
    return this.alertModel.findByIdAndDelete(id).exec();
  }
}
