import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class RetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async purgeTerminalTickets(organizationId: string, actorId: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const cutoff = new Date(Date.now() - organization.ticketRetentionDays * 24 * 60 * 60 * 1000);

    const deleted = await this.prisma.ticket.deleteMany({
      where: {
        branch: { organizationId },
        status: { in: ["COMPLETED", "NO_SHOW", "CANCELLED"] },
        completedAt: { lt: cutoff }
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        actorId,
        action: "tickets.purged",
        entity: "organization",
        entityId: organizationId,
        metadata: { cutoff: cutoff.toISOString(), deleted: deleted.count, retentionDays: organization.ticketRetentionDays }
      }
    });

    return { deleted: deleted.count, cutoff: cutoff.toISOString(), retentionDays: organization.ticketRetentionDays };
  }
}
