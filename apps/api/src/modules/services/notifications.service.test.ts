import { afterEach, describe, expect, it, vi } from "vitest";
import { messageProvider, renderNotificationTemplate } from "./notifications.service.js";

const fetchMock = vi.fn();

describe("renderNotificationTemplate", () => {
  it("replaces supported ticket placeholders", () => {
    expect(
      renderNotificationTemplate("Ticket {{code}} for {{serviceName}}: {{ticketUrl}}", {
        code: "A-001",
        serviceName: "General Service",
        ticketUrl: "https://example.com/ticket/ticket-1"
      })
    ).toBe("Ticket A-001 for General Service: https://example.com/ticket/ticket-1");
  });
});

describe("messageProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts normalized webhook payloads for SMS providers", async () => {
    vi.stubEnv("SMS_PROVIDER", "webhook");
    vi.stubEnv("SMS_WEBHOOK_URL", "https://sms.example.com/send");
    vi.stubEnv("SMS_WEBHOOK_SECRET", "secret-1");
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await messageProvider("sms").send({
      channel: "sms",
      to: "+15551234567",
      text: "Ticket A-001",
      ticket: {
        code: "A-001",
        serviceName: "General Service",
        ticketUrl: "https://qms.example.com/ticket/ticket-1"
      }
    });

    expect(fetchMock).toHaveBeenCalledWith("https://sms.example.com/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-1"
      },
      body: JSON.stringify({
        channel: "sms",
        to: "+15551234567",
        text: "Ticket A-001",
        ticket: {
          code: "A-001",
          serviceName: "General Service",
          ticketUrl: "https://qms.example.com/ticket/ticket-1"
        }
      })
    });
  });

  it("falls back to disabled for unsupported providers", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("WHATSAPP_PROVIDER", "unknown");

    await expect(messageProvider("whatsapp").send({
      channel: "whatsapp",
      to: "+15551234567",
      text: "Ticket A-001",
      ticket: { code: "A-001", serviceName: "General Service", ticketUrl: "https://example.com/ticket/ticket-1" }
    })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('Unsupported whatsapp provider "unknown". Falling back to disabled.');

    errorSpy.mockRestore();
  });
});
