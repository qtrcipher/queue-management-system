import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class NotificationsService {
  async sendTicketCreatedEmail(to: string | undefined, code: string) {
    if (!to || !to.includes("@")) return;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? "QMS <no-reply@example.com>",
      to,
      subject: `Your queue ticket is ${code}`,
      text: `Your ticket number is ${code}. We will call you when it is your turn.`
    });
  }

  async sendMockSms(phone: string | undefined, message: string) {
    if (!phone) return;
    console.info(`[mock-sms] ${phone}: ${message}`);
  }
}

