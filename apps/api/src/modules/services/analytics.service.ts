import { Injectable } from "@nestjs/common";
import type { Ticket, TicketStatus } from "@prisma/client";
import { PrismaService } from "./prisma.service.js";

type TicketWithRelations = Awaited<ReturnType<AnalyticsService["ticketsInRange"]>>[number];

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function minutesBetween(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function safeCsv(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll("\"", "\"\"")}"`;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(organizationId: string, start?: string, end?: string, branchId?: string) {
    const range = this.dateRange(start, end);
    const [tickets, branchDashboard] = await Promise.all([
      this.ticketsInRange(organizationId, range.start, range.end, branchId),
      this.branchDashboard(organizationId, range.start, range.end)
    ]);

    const byStatus = tickets.reduce<Record<TicketStatus, number>>((acc, ticket) => {
      acc[ticket.status] = (acc[ticket.status] ?? 0) + 1;
      return acc;
    }, {} as Record<TicketStatus, number>);

    const waitDurations = tickets
      .map((ticket) => minutesBetween(ticket.issuedAt, ticket.calledAt))
      .filter((value): value is number => value !== null);
    const serviceDurations = tickets
      .map((ticket) => minutesBetween(ticket.startedAt, ticket.completedAt))
      .filter((value): value is number => value !== null);

    const services = new Map<string, { serviceId: string; prefix: string; nameEn: string; nameAr: string; issued: number; completed: number; noShow: number; waitDurations: number[]; serviceDurations: number[] }>();
    for (const ticket of tickets) {
      const row = services.get(ticket.serviceId) ?? {
        serviceId: ticket.serviceId,
        prefix: ticket.service.prefix,
        nameEn: ticket.service.nameEn,
        nameAr: ticket.service.nameAr,
        issued: 0,
        completed: 0,
        noShow: 0,
        waitDurations: [],
        serviceDurations: []
      };
      row.issued += 1;
      if (ticket.status === "COMPLETED") row.completed += 1;
      if (ticket.status === "NO_SHOW") row.noShow += 1;
      const wait = minutesBetween(ticket.issuedAt, ticket.calledAt);
      const service = minutesBetween(ticket.startedAt, ticket.completedAt);
      if (wait !== null) row.waitDurations.push(wait);
      if (service !== null) row.serviceDurations.push(service);
      services.set(ticket.serviceId, row);
    }

    const hourlyArrivals = Array.from({ length: 24 }, (_unused, hour) => ({
      hour,
      issued: tickets.filter((ticket) => ticket.issuedAt.getUTCHours() === hour).length
    }));

    return {
      range: { start: range.start.toISOString(), end: range.end.toISOString(), branchId: branchId ?? null },
      totals: {
        issued: tickets.length,
        waiting: byStatus.WAITING ?? 0,
        called: byStatus.CALLED ?? 0,
        serving: byStatus.SERVING ?? 0,
        completed: byStatus.COMPLETED ?? 0,
        noShow: byStatus.NO_SHOW ?? 0,
        cancelled: byStatus.CANCELLED ?? 0,
        transferred: byStatus.TRANSFERRED ?? 0,
        averageWaitMinutes: average(waitDurations),
        averageServiceMinutes: average(serviceDurations),
        completionRate: tickets.length ? Math.round(((byStatus.COMPLETED ?? 0) / tickets.length) * 1000) / 10 : 0,
        noShowRate: tickets.length ? Math.round(((byStatus.NO_SHOW ?? 0) / tickets.length) * 1000) / 10 : 0
      },
      services: [...services.values()].map((service) => ({
        serviceId: service.serviceId,
        prefix: service.prefix,
        nameEn: service.nameEn,
        nameAr: service.nameAr,
        issued: service.issued,
        completed: service.completed,
        noShow: service.noShow,
        averageWaitMinutes: average(service.waitDurations),
        averageServiceMinutes: average(service.serviceDurations)
      })),
      branchDashboard,
      hourlyArrivals
    };
  }

  async ticketsCsv(organizationId: string, start?: string, end?: string, branchId?: string) {
    const range = this.dateRange(start, end);
    const tickets = await this.ticketsInRange(organizationId, range.start, range.end, branchId);
    const header = ["code", "status", "branch", "service", "counter", "issuedAt", "calledAt", "startedAt", "completedAt", "waitMinutes", "serviceMinutes"];
    const rows = tickets.map((ticket) => [
      ticket.code,
      ticket.status,
      ticket.branch.nameEn,
      ticket.service.nameEn,
      ticket.counter?.nameEn ?? "",
      ticket.issuedAt.toISOString(),
      ticket.calledAt?.toISOString() ?? "",
      ticket.startedAt?.toISOString() ?? "",
      ticket.completedAt?.toISOString() ?? "",
      minutesBetween(ticket.issuedAt, ticket.calledAt)?.toFixed(1) ?? "",
      minutesBetween(ticket.startedAt, ticket.completedAt)?.toFixed(1) ?? ""
    ]);

    return [header, ...rows].map((row) => row.map(safeCsv).join(",")).join("\n");
  }

  private dateRange(start?: string, end?: string) {
    const fallbackStart = startOfToday();
    const rangeStart = parseDate(start, fallbackStart);
    const rangeEnd = end ? addDays(parseDate(end, fallbackStart), 1) : addDays(rangeStart, 1);
    return { start: rangeStart, end: rangeEnd };
  }

  private ticketsInRange(organizationId: string, start: Date, end: Date, branchId?: string) {
    return this.prisma.ticket.findMany({
      where: { issuedAt: { gte: start, lt: end }, branch: { organizationId }, ...(branchId ? { branchId } : {}) },
      include: { branch: true, service: true, counter: true },
      orderBy: { issuedAt: "asc" }
    });
  }

  private async branchDashboard(organizationId: string, start: Date, end: Date) {
    const branches = await this.prisma.branch.findMany({
      where: { organizationId },
      include: {
        counters: true,
        services: true,
        tickets: {
          where: { issuedAt: { gte: start, lt: end } },
          orderBy: { issuedAt: "asc" }
        }
      },
      orderBy: { nameEn: "asc" }
    });

    return branches.map((branch) => {
      const byStatus = branch.tickets.reduce<Record<TicketStatus, number>>((acc, ticket) => {
        acc[ticket.status] = (acc[ticket.status] ?? 0) + 1;
        return acc;
      }, {} as Record<TicketStatus, number>);
      const waitDurations = branch.tickets
        .map((ticket) => minutesBetween(ticket.issuedAt, ticket.calledAt))
        .filter((value): value is number => value !== null);

      return {
        branchId: branch.id,
        slug: branch.slug,
        nameEn: branch.nameEn,
        nameAr: branch.nameAr,
        services: branch.services.filter((service) => service.isActive).length,
        openCounters: branch.counters.filter((counter) => counter.isOpen).length,
        issued: branch.tickets.length,
        waiting: byStatus.WAITING ?? 0,
        serving: (byStatus.CALLED ?? 0) + (byStatus.SERVING ?? 0),
        completed: byStatus.COMPLETED ?? 0,
        noShow: byStatus.NO_SHOW ?? 0,
        averageWaitMinutes: average(waitDurations)
      };
    });
  }
}
