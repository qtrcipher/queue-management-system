import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type TicketStatus } from "@prisma/client";
import { NotificationsService } from "./notifications.service.js";
import { PrismaService } from "./prisma.service.js";
import { QueueGateway } from "../queue.gateway.js";

interface CreateTicketInput {
  branchId: string;
  serviceId: string;
  customerName?: string;
  customerPhone?: string;
}

function formatTicketCode(prefix: string, number: number): string {
  return `${prefix.toUpperCase()}-${number.toString().padStart(3, "0")}`;
}

function estimateWaitMinutes(numberAhead: number, averageServiceMinutes: number, openCounters: number): number {
  if (numberAhead <= 0) return 0;
  return Math.max(1, Math.ceil((numberAhead * averageServiceMinutes) / Math.max(1, openCounters)));
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: QueueGateway,
    private readonly notifications: NotificationsService
  ) {}

  async createTicket(input: CreateTicketInput) {
    const service = await this.prisma.service.findUnique({ where: { id: input.serviceId } });
    if (!service) throw new NotFoundException("Service not found");

    const today = new Date().toISOString().slice(0, 10);
    const ticket = await this.prisma.$transaction(async (tx) => {
      const sequence = await tx.ticketSequence.upsert({
        where: { branchId_serviceId_date: { branchId: input.branchId, serviceId: input.serviceId, date: today } },
        update: { nextValue: { increment: 1 } },
        create: { branchId: input.branchId, serviceId: input.serviceId, date: today, nextValue: 2 }
      });
      const number = sequence.nextValue - 1;
      const created = await tx.ticket.create({
        data: {
          branchId: input.branchId,
          serviceId: input.serviceId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          number,
          code: formatTicketCode(service.prefix, number),
          events: { create: { status: "WAITING", note: "Ticket created" } }
        },
        include: { service: true, counter: true }
      });

      await tx.auditEvent.create({
        data: { action: "ticket.created", entity: "ticket", entityId: created.id, metadata: { code: created.code } }
      });

      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.notifications.sendMockSms(input.customerPhone, `Your queue ticket is ${ticket.code}`);
    this.gateway.emitQueueEvent("ticket.created", ticket);
    return ticket;
  }

  async getTicket(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { service: true, counter: true, events: { orderBy: { createdAt: "desc" } } }
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  async getTicketStatus(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        branch: true,
        service: true,
        counter: true,
        events: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!ticket) throw new NotFoundException("Ticket not found");

    const waitingAhead = await this.prisma.ticket.count({
      where: {
        branchId: ticket.branchId,
        serviceId: ticket.serviceId,
        status: { in: ["WAITING", "TRANSFERRED"] },
        issuedAt: { lt: ticket.issuedAt }
      }
    });

    const activeCounters = await this.prisma.counter.count({
      where: { branchId: ticket.branchId, isOpen: true }
    });

    const recentCompleted = await this.prisma.ticket.findMany({
      where: {
        branchId: ticket.branchId,
        serviceId: ticket.serviceId,
        status: "COMPLETED",
        startedAt: { not: null },
        completedAt: { not: null }
      },
      orderBy: { completedAt: "desc" },
      take: 20
    });

    const serviceDurations = recentCompleted
      .map((completed) => {
        if (!completed.startedAt || !completed.completedAt) return 0;
        return (completed.completedAt.getTime() - completed.startedAt.getTime()) / 60000;
      })
      .filter((minutes) => minutes > 0);
    const averageServiceMinutes = serviceDurations.length
      ? serviceDurations.reduce((sum, minutes) => sum + minutes, 0) / serviceDurations.length
      : 5;

    return {
      ticket,
      branch: ticket.branch,
      service: ticket.service,
      counter: ticket.counter,
      position: ["WAITING", "TRANSFERRED"].includes(ticket.status) ? waitingAhead + 1 : 0,
      numberAhead: ["WAITING", "TRANSFERRED"].includes(ticket.status) ? waitingAhead : 0,
      estimatedWaitMinutes: ["WAITING", "TRANSFERRED"].includes(ticket.status)
        ? estimateWaitMinutes(waitingAhead, averageServiceMinutes, activeCounters)
        : 0,
      activeCounters,
      updatedAt: new Date().toISOString()
    };
  }

  async callNext(branchId: string, serviceId: string, counterId?: string) {
    const ticket = await this.prisma.$transaction(async (tx) => {
      const next = await tx.ticket.findFirst({
        where: { branchId, serviceId, status: { in: ["WAITING", "TRANSFERRED"] } },
        orderBy: { issuedAt: "asc" }
      });
      if (!next) return null;

      const updated = await tx.ticket.update({
        where: { id: next.id },
        data: {
          status: "CALLED",
          counterId,
          calledAt: new Date(),
          events: { create: { status: "CALLED", note: "Called by staff" } }
        },
        include: { service: true, counter: true }
      });

      await tx.auditEvent.create({
        data: { action: "ticket.called", entity: "ticket", entityId: updated.id, metadata: { counterId } }
      });

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (ticket) this.gateway.emitQueueEvent("ticket.called", ticket);
    return ticket;
  }

  async updateTicket(ticketId: string, status: TicketStatus) {
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        startedAt: status === "SERVING" ? new Date() : undefined,
        completedAt: ["COMPLETED", "NO_SHOW", "CANCELLED"].includes(status) ? new Date() : undefined,
        events: { create: { status, note: `Status changed to ${status}` } }
      },
      include: { service: true, counter: true }
    });

    this.gateway.emitQueueEvent("ticket.updated", ticket);
    return ticket;
  }

  async recallTicket(ticketId: string) {
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: "CALLED",
        calledAt: new Date(),
        events: { create: { status: "CALLED", note: "Ticket recalled by staff" } }
      },
      include: { service: true, counter: true }
    });

    this.gateway.emitQueueEvent("ticket.called", ticket);
    return ticket;
  }

  async transferTicket(ticketId: string, serviceId: string) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundException("Service not found");

    const today = new Date().toISOString().slice(0, 10);
    const ticket = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!existing) throw new NotFoundException("Ticket not found");

      const sequence = await tx.ticketSequence.upsert({
        where: { branchId_serviceId_date: { branchId: existing.branchId, serviceId, date: today } },
        update: { nextValue: { increment: 1 } },
        create: { branchId: existing.branchId, serviceId, date: today, nextValue: 2 }
      });
      const number = sequence.nextValue - 1;

      return tx.ticket.update({
        where: { id: ticketId },
        data: {
          serviceId,
          counterId: null,
          number,
          code: formatTicketCode(service.prefix, number),
          status: "TRANSFERRED",
          events: { create: { status: "TRANSFERRED", note: `Transferred to ${service.nameEn}` } }
        },
        include: { service: true, counter: true }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.gateway.emitQueueEvent("ticket.updated", ticket);
    return ticket;
  }

  async snapshot(branchId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { branchId, status: { in: ["WAITING", "CALLED", "SERVING"] } },
      include: { service: true, counter: true },
      orderBy: { issuedAt: "asc" }
    });

    return {
      branchId,
      waiting: tickets.filter((ticket) => ticket.status === "WAITING"),
      called: tickets.filter((ticket) => ticket.status === "CALLED"),
      serving: tickets.filter((ticket) => ticket.status === "SERVING"),
      updatedAt: new Date().toISOString()
    };
  }
}
