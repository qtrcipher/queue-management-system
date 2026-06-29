import { describe, expect, it } from "vitest";
import { renderNotificationTemplate } from "./notifications.service.js";

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
