import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { APP_CONFIG, type AppConfig } from "../config.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Gửi email qua SMTP (SMTP_URL, vd. Gmail với mật khẩu ứng dụng).
 * Chưa cấu hình SMTP: KHÔNG gửi, chỉ ghi nội dung vào log máy chủ để quản trị lấy link thủ công (bản demo).
 * Khi chạy test: lưu vào `outbox` để kiểm tra.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger("Email");
  private readonly transport: Transporter | null;
  readonly outbox: MailMessage[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(msg: MailMessage): Promise<void> {
    if (this.config.NODE_ENV === "test") {
      this.outbox.push(msg);
      return;
    }
    if (!this.transport) {
      this.logger.warn(`Chưa cấu hình SMTP_URL — không gửi email. Tới: ${msg.to} | ${msg.subject}\n${msg.text}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: this.config.SMTP_FROM, to: msg.to, subject: msg.subject, text: msg.text });
    } catch (err) {
      // Không làm lộ lỗi SMTP cho người dùng (tránh dò email); quản trị xem log
      this.logger.error(`Gửi email tới ${msg.to} thất bại: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
