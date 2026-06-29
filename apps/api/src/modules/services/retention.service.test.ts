import { describe, expect, it, vi } from "vitest";
import { RetentionService } from "./retention.service.js";

describe("RetentionService", () => {
  it("purges terminal tickets older than the organization retention window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T12:00:00.000Z"));

    const prisma = {
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "org-1", ticketRetentionDays: 30 })
      },
      ticket: {
        deleteMany: vi.fn().mockResolvedValue({ count: 3 })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };

    const result = await new RetentionService(prisma as never).purgeTerminalTickets("org-1", "user-1");

    expect(prisma.ticket.deleteMany).toHaveBeenCalledWith({
      where: {
        branch: { organizationId: "org-1" },
        status: { in: ["COMPLETED", "NO_SHOW", "CANCELLED"] },
        completedAt: { lt: new Date("2026-05-30T12:00:00.000Z") }
      }
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        actorId: "user-1",
        action: "tickets.purged",
        entity: "organization",
        entityId: "org-1",
        metadata: { cutoff: "2026-05-30T12:00:00.000Z", deleted: 3, retentionDays: 30 }
      }
    });
    expect(result).toEqual({ deleted: 3, cutoff: "2026-05-30T12:00:00.000Z", retentionDays: 30 });

    vi.useRealTimers();
  });
});
