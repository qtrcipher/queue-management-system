import { describe, expect, it, vi } from "vitest";
import { QueueService } from "./queue.service.js";

describe("QueueService appointments", () => {
  it("redacts public ticket customer contact fields", async () => {
    const issuedAt = new Date("2026-06-29T08:00:00.000Z");
    const prisma = {
      ticket: {
        findUnique: vi.fn().mockResolvedValue({
          id: "ticket-1",
          branchId: "branch-1",
          serviceId: "service-1",
          counterId: null,
          source: "WALK_IN",
          number: 1,
          code: "A-001",
          status: "WAITING",
          customerName: "Mona",
          customerPhone: "+97455550000",
          customerEmail: "mona@example.com",
          scheduledFor: null,
          checkedInAt: null,
          createdAt: issuedAt,
          issuedAt,
          calledAt: null,
          startedAt: null,
          completedAt: null,
          service: { id: "service-1", prefix: "A", nameEn: "General", nameAr: "عام" },
          counter: null,
          events: [
            {
              id: "event-1",
              ticketId: "ticket-1",
              status: "WAITING",
              note: "Ticket created",
              createdAt: issuedAt
            }
          ]
        })
      }
    };
    const gateway = { emitQueueEvent: vi.fn() };
    const notifications = { sendTicketCreated: vi.fn() };

    const ticket = await new QueueService(prisma as never, gateway as never, notifications as never).getTicket("ticket-1");

    expect(ticket).toMatchObject({ id: "ticket-1", code: "A-001", status: "WAITING" });
    expect(ticket).not.toHaveProperty("customerName");
    expect(ticket).not.toHaveProperty("customerPhone");
    expect(ticket).not.toHaveProperty("customerEmail");
    expect(ticket.events).toEqual([{ status: "WAITING", note: "Ticket created", createdAt: issuedAt }]);
  });

  it("creates scheduled appointments as appointment tickets", async () => {
    const scheduledFor = new Date("2026-06-29T09:30:00.000Z");
    const tx = {
      ticketSequence: {
        upsert: vi.fn().mockResolvedValue({ nextValue: 6 })
      },
      ticket: {
        create: vi.fn().mockResolvedValue({
          id: "ticket-1",
          code: "A-005",
          source: "APPOINTMENT",
          scheduledFor,
          service: { prefix: "A" },
          counter: null
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    const prisma = {
      service: {
        findUnique: vi.fn().mockResolvedValue({
          id: "service-1",
          branchId: "branch-1",
          prefix: "A",
          nameEn: "General",
          branch: { organization: {} }
        })
      },
      $transaction: vi.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    };
    const gateway = { emitQueueEvent: vi.fn() };
    const notifications = { sendTicketCreated: vi.fn().mockResolvedValue(undefined) };

    const ticket = await new QueueService(prisma as never, gateway as never, notifications as never).scheduleAppointment({
      branchId: "branch-1",
      serviceId: "service-1",
      scheduledFor,
      customerName: "Mona",
      customerEmail: "mona@example.com"
    });

    expect(tx.ticketSequence.upsert).toHaveBeenCalledWith({
      where: { branchId_serviceId_date: { branchId: "branch-1", serviceId: "service-1", date: "2026-06-29" } },
      update: { nextValue: { increment: 1 } },
      create: { branchId: "branch-1", serviceId: "service-1", date: "2026-06-29", nextValue: 2 }
    });
    expect(tx.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: "APPOINTMENT",
        customerName: "Mona",
        customerEmail: "mona@example.com",
        scheduledFor,
        issuedAt: scheduledFor,
        number: 5,
        code: "A-005",
        events: { create: { status: "WAITING", note: "Appointment scheduled" } }
      }),
      include: { service: true, counter: true }
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "appointment.scheduled",
        metadata: { code: "A-005", scheduledFor: "2026-06-29T09:30:00.000Z" }
      })
    });
    expect(gateway.emitQueueEvent).toHaveBeenCalledWith("ticket.created", ticket);
  });

  it("calls walk-ins and due appointments from one blended queue", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T10:00:00.000Z"));

    const next = { id: "ticket-1", source: "APPOINTMENT", checkedInAt: null };
    const tx = {
      ticket: {
        findFirst: vi.fn().mockResolvedValue(next),
        update: vi.fn().mockResolvedValue({ id: "ticket-1", code: "A-001", service: {}, counter: null })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    const prisma = {
      service: {
        findFirst: vi.fn().mockResolvedValue({ id: "service-1" })
      },
      counter: {
        findFirst: vi.fn().mockResolvedValue({ id: "counter-1" })
      },
      $transaction: vi.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    };
    const gateway = { emitQueueEvent: vi.fn() };
    const notifications = { sendTicketCreated: vi.fn() };

    await new QueueService(prisma as never, gateway as never, notifications as never).callNext("branch-1", "service-1", "org-1", "counter-1");

    expect(prisma.service.findFirst).toHaveBeenCalledWith({
      where: { id: "service-1", branchId: "branch-1", branch: { organizationId: "org-1" } },
      select: { id: true }
    });
    expect(prisma.counter.findFirst).toHaveBeenCalledWith({
      where: { id: "counter-1", branchId: "branch-1", branch: { organizationId: "org-1" } },
      select: { id: true }
    });

    expect(tx.ticket.findFirst).toHaveBeenCalledWith({
      where: {
        branchId: "branch-1",
        serviceId: "service-1",
        status: { in: ["WAITING", "TRANSFERRED"] },
        OR: [
          { source: "WALK_IN" },
          { source: "APPOINTMENT", scheduledFor: { lte: new Date("2026-06-29T10:00:00.000Z") } },
          { source: "APPOINTMENT", scheduledFor: null }
        ]
      },
      orderBy: { issuedAt: "asc" }
    });
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: expect.objectContaining({
        status: "CALLED",
        counterId: "counter-1",
        checkedInAt: new Date("2026-06-29T10:00:00.000Z")
      }),
      include: { service: true, counter: true }
    });

    vi.useRealTimers();
  });
});
