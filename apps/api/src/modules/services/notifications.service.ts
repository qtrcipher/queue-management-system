import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

type TicketNotificationSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
  ticketEmailSubject: string;
  ticketEmailBody: string;
  ticketSmsTemplate: string;
};

type TicketNotificationInput = {
  customerEmail?: string;
  customerPhone?: string;
  code: string;
  serviceName: string;
  ticketUrl: string;
  settings: TicketNotificationSettings;
};

export function renderNotificationTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(code|serviceName|ticketUrl)\}\}/g, (_match, key: string) => values[key] ?? "");
}

@Injectable()
export class NotificationsService {
  async sendTicketCreated(input: TicketNotificationInput) {
    const values = {
      code: input.code,
      serviceName: input.serviceName,
      ticketUrl: input.ticketUrl
    };

    if (input.customerEmail?.includes("@")) {
      try {
        const transporter = nodemailer.createTransport({
          host: input.settings.smtpHost,
          port: input.settings.smtpPort,
          secure: false
        });

        await transporter.sendMail({
          from: input.settings.smtpFrom,
          to: input.customerEmail,
          subject: renderNotificationTemplate(input.settings.ticketEmailSubject, values),
          text: renderNotificationTemplate(input.settings.ticketEmailBody, values)
        });
      } catch (error) {
        console.error("Ticket email notification failed", error);
      }
    }

    if (input.customerPhone) {
      console.info(`[mock-sms] ${input.customerPhone}: ${renderNotificationTemplate(input.settings.ticketSmsTemplate, values)}`);
    }
  }
}
