import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

type MessageChannel = "sms" | "whatsapp";
type MessageProviderName = "disabled" | "mock" | "webhook";

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

type MessageInput = {
  channel: MessageChannel;
  to: string;
  text: string;
  ticket: {
    code: string;
    serviceName: string;
    ticketUrl: string;
  };
};

interface MessageProvider {
  send(input: MessageInput): Promise<void>;
}

export function renderNotificationTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(code|serviceName|ticketUrl)\}\}/g, (_match, key: string) => values[key] ?? "");
}

class DisabledMessageProvider implements MessageProvider {
  async send() {
    return undefined;
  }
}

class MockMessageProvider implements MessageProvider {
  async send(input: MessageInput) {
    console.info(`[mock-${input.channel}] ${input.to}: ${input.text}`);
  }
}

class WebhookMessageProvider implements MessageProvider {
  constructor(
    private readonly url: string,
    private readonly secret: string | undefined
  ) {}

  async send(input: MessageInput) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.secret ? { Authorization: `Bearer ${this.secret}` } : {})
      },
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error(`Webhook notification failed with ${response.status}`);
  }
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
      const text = renderNotificationTemplate(input.settings.ticketSmsTemplate, values);
      await this.sendMessage("sms", input.customerPhone, text, values);
      await this.sendMessage("whatsapp", input.customerPhone, text, values);
    }
  }

  private async sendMessage(channel: MessageChannel, to: string, text: string, ticket: MessageInput["ticket"]) {
    try {
      await messageProvider(channel).send({ channel, to, text, ticket });
    } catch (error) {
      console.error(`Ticket ${channel} notification failed`, error);
    }
  }
}

export function messageProvider(channel: MessageChannel): MessageProvider {
  const provider = providerName(channel);
  if (provider === "disabled") return new DisabledMessageProvider();
  if (provider === "mock") return new MockMessageProvider();
  return new WebhookMessageProvider(requiredWebhookUrl(channel), process.env[`${envPrefix(channel)}_WEBHOOK_SECRET`]);
}

function providerName(channel: MessageChannel): MessageProviderName {
  const fallback: MessageProviderName = channel === "sms" ? "mock" : "disabled";
  const configured = process.env[`${envPrefix(channel)}_PROVIDER`]?.toLowerCase() ?? fallback;
  if (configured === "disabled" || configured === "mock" || configured === "webhook") return configured;
  console.error(`Unsupported ${channel} provider "${configured}". Falling back to disabled.`);
  return "disabled";
}

function requiredWebhookUrl(channel: MessageChannel) {
  const value = process.env[`${envPrefix(channel)}_WEBHOOK_URL`];
  if (!value) throw new Error(`${envPrefix(channel)}_WEBHOOK_URL is required when ${envPrefix(channel)}_PROVIDER=webhook`);
  return value;
}

function envPrefix(channel: MessageChannel) {
  return channel.toUpperCase();
}
