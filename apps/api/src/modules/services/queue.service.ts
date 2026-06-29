import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Counter, type Service, type Ticket, type TicketEvent, type TicketSource, type TicketStatus } from "@prisma/client";
import { NotificationsService } from "./notifications.service.js";
import { PrismaService } from "./prisma.service.js";
import { QueueGateway } from "../queue.gateway.js";

interface CreateTicketInput {
  branchId: string;
  serviceId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  source?: TicketSource;
  scheduledFor?: Date;
}

interface ScheduleAppointmentInput {
  branchId: string;
  serviceId: string;
  scheduledFor: Date;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
}

type PublicTicketInput = Pick<Ticket,
  "id" | "branchId" | "serviceId" | "counterId" | "source" | "number" | "code" | "status" |
  "scheduledFor" | "checkedInAt" | "createdAt" | "issuedAt" | "calledAt" | "startedAt" | "completedAt"
> & {
  service?: Service;
  counter?: Counter | null;
  events?: Pick<TicketEvent, "status" | "note" | "createdAt">[];
};

function formatTicketCode(prefix: string, number: number): string {
  return `${prefix.toUpperCase()}-${number.toString().padStart(3, "0")}`;
}

function estimateWaitMinutes(numberAhead: number, averageServiceMinutes: number, openCounters: number): number {
  if (numberAhead <= 0) return 0;
  return Math.max(1, Math.ceil((numberAhead * averageServiceMinutes) / Math.max(1, openCounters)));
}

function sequenceDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function activeQueueWhere(now: Date): Prisma.TicketWhereInput {
  return {
    OR: [
      { source: "WALK_IN" },
      { source: "APPOINTMENT", scheduledFor: { lte: now } },
      { source: "APPOINTMENT", scheduledFor: null }
    ]
  };
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: QueueGateway,
    private readonly notifications: NotificationsService
  ) {}

  async createTicket(input: CreateTicketInput) {
    const service = await this.prisma.service.findUnique({
      where: { id: input.serviceId },
      include: { branch: { include: { organization: true } } }
    });
    if (!service) throw new NotFoundException("Service not found");
    if (service.branchId !== input.branchId) throw new BadRequestException("Service does not belong to this branch");

    const source = input.source ?? "WALK_IN";
    const scheduledFor = input.scheduledFor;
    if (source === "APPOINTMENT" && !scheduledFor) throw new BadRequestException("scheduledFor is required for appointments");

    const issuedAt = scheduledFor ?? new Date();
    const date = sequenceDate(issuedAt);
    const ticket = await this.prisma.$transaction(async (tx) => {
      const sequence = await tx.ticketSequence.upsert({
        where: { branchId_serviceId_date: { branchId: input.branchId, serviceId: input.serviceId, date } },
        update: { nextValue: { increment: 1 } },
        create: { branchId: input.branchId, serviceId: input.serviceId, date, nextValue: 2 }
      });
      const number = sequence.nextValue - 1;
      const created = await tx.ticket.create({
        data: {
          branchId: input.branchId,
          serviceId: input.serviceId,
          source,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail,
          scheduledFor,
          issuedAt,
          number,
          code: formatTicketCode(service.prefix, number),
          events: { create: { status: "WAITING", note: source === "APPOINTMENT" ? "Appointment scheduled" : "Ticket created" } }
        },
        include: { service: true, counter: true }
      });

      await tx.auditEvent.create({
        data: {
          action: source === "APPOINTMENT" ? "appointment.scheduled" : "ticket.created",
          entity: "ticket",
          entityId: created.id,
          metadata: { code: created.code, scheduledFor: scheduledFor?.toISOString() }
        }
      });

      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.notifications.sendTicketCreated({
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      code: ticket.code,
      serviceName: service.nameEn,
      ticketUrl: `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/ticket/${ticket.id}`,
      settings: service.branch.organization
    });
    this.gateway.emitQueueEvent("ticket.created", ticket);
    return ticket;
  }

  scheduleAppointment(input: ScheduleAppointmentInput) {
    return this.createTicket({ ...input, source: "APPOINTMENT" });
  }

  async getTicket(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { service: true, counter: true, events: { orderBy: { createdAt: "desc" } } }
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return this.publicTicket(ticket);
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

    const now = new Date();
    const canBeCalled = ticket.source === "WALK_IN" || !ticket.scheduledFor || ticket.scheduledFor <= now;
    const waitingAhead = canBeCalled ? await this.prisma.ticket.count({
      where: {
        branchId: ticket.branchId,
        serviceId: ticket.serviceId,
        status: { in: ["WAITING", "TRANSFERRED"] },
        issuedAt: { lt: ticket.issuedAt },
        ...activeQueueWhere(now)
      }
    }) : 0;

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
      ticket: this.publicTicket(ticket),
      branch: ticket.branch,
      service: ticket.service,
      counter: ticket.counter,
      position: ["WAITING", "TRANSFERRED"].includes(ticket.status) && canBeCalled ? waitingAhead + 1 : 0,
      numberAhead: ["WAITING", "TRANSFERRED"].includes(ticket.status) && canBeCalled ? waitingAhead : 0,
      estimatedWaitMinutes: ["WAITING", "TRANSFERRED"].includes(ticket.status) && canBeCalled
        ? estimateWaitMinutes(waitingAhead, averageServiceMinutes, activeCounters)
        : 0,
      activeCounters,
      updatedAt: new Date().toISOString()
    };
  }

  async callNext(branchId: string, serviceId: string, organizationId: string, counterId?: string) {
    await this.assertServiceInOrganization(serviceId, organizationId, branchId);
    if (counterId) await this.assertCounterInOrganization(counterId, organizationId, branchId);
    const now = new Date();
    const ticket = await this.prisma.$transaction(async (tx) => {
      const next = await tx.ticket.findFirst({
        where: { branchId, serviceId, status: { in: ["WAITING", "TRANSFERRED"] }, ...activeQueueWhere(now) },
        orderBy: { issuedAt: "asc" }
      });
      if (!next) return null;

      const updated = await tx.ticket.update({
        where: { id: next.id },
        data: {
          status: "CALLED",
          counterId,
          checkedInAt: next.source === "APPOINTMENT" && !next.checkedInAt ? now : undefined,
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

  async updateTicket(ticketId: string, status: TicketStatus, organizationId: string) {
    await this.assertTicketInOrganization(ticketId, organizationId);
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

  async recallTicket(ticketId: string, organizationId: string) {
    await this.assertTicketInOrganization(ticketId, organizationId);
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

  async transferTicket(ticketId: string, serviceId: string, organizationId: string) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundException("Service not found");
    await this.assertServiceInOrganization(serviceId, organizationId);
    await this.assertTicketInOrganization(ticketId, organizationId);

    const today = new Date().toISOString().slice(0, 10);
    const ticket = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!existing) throw new NotFoundException("Ticket not found");
      if (service.branchId !== existing.branchId) throw new BadRequestException("Service does not belong to this branch");

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
    const now = new Date();
    const tickets = await this.prisma.ticket.findMany({
      where: {
        branchId,
        OR: [
          { status: { in: ["CALLED", "SERVING"] } },
          { status: { in: ["WAITING", "TRANSFERRED"] }, ...activeQueueWhere(now) }
        ]
      },
      include: { service: true, counter: true },
      orderBy: { issuedAt: "asc" }
    });

    return {
      branchId,
      waiting: tickets.filter((ticket) => ["WAITING", "TRANSFERRED"].includes(ticket.status)),
      called: tickets.filter((ticket) => ticket.status === "CALLED"),
      serving: tickets.filter((ticket) => ticket.status === "SERVING"),
      updatedAt: new Date().toISOString()
    };
  }

  private publicTicket(ticket: PublicTicketInput) {
    return {
      id: ticket.id,
      branchId: ticket.branchId,
      serviceId: ticket.serviceId,
      counterId: ticket.counterId,
      source: ticket.source,
      number: ticket.number,
      code: ticket.code,
      status: ticket.status,
      scheduledFor: ticket.scheduledFor,
      checkedInAt: ticket.checkedInAt,
      createdAt: ticket.createdAt,
      issuedAt: ticket.issuedAt,
      calledAt: ticket.calledAt,
      startedAt: ticket.startedAt,
      completedAt: ticket.completedAt,
      service: ticket.service,
      counter: ticket.counter,
      events: ticket.events?.map((event) => ({ status: event.status, note: event.note, createdAt: event.createdAt }))
    };
  }

  private async assertTicketInOrganization(ticketId: string, organizationId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, branch: { organizationId } },
      select: { id: true }
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
  }

  private async assertServiceInOrganization(serviceId: string, organizationId: string, branchId?: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, ...(branchId ? { branchId } : {}), branch: { organizationId } },
      select: { id: true }
    });
    if (!service) throw new NotFoundException("Service not found");
  }

  private async assertCounterInOrganization(counterId: string, organizationId: string, branchId?: string) {
    const counter = await this.prisma.counter.findFirst({
      where: { id: counterId, ...(branchId ? { branchId } : {}), branch: { organizationId } },
      select: { id: true }
    });
    if (!counter) throw new NotFoundException("Counter not found");
  }
}
