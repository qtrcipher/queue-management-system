import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { CurrentUser } from "../decorators/current-user.decorator.js";
import { Roles } from "../decorators/roles.decorator.js";
import { RolesGuard } from "../guards/roles.guard.js";
import type { SessionUser } from "../guards/session.guard.js";
import { QueueService } from "../services/queue.service.js";

class StaffActionDto {
  @IsString()
  @IsOptional()
  counterId?: string;
}

class TransferDto {
  @IsString()
  serviceId!: string;
}

@Controller("staff")
@UseGuards(RolesGuard)
@Roles("OWNER", "ADMIN", "BRANCH_MANAGER", "AGENT")
export class StaffController {
  constructor(private readonly queue: QueueService) {}

  @Post(":branchId/services/:serviceId/call-next")
  callNext(@CurrentUser() actor: SessionUser, @Param("branchId") branchId: string, @Param("serviceId") serviceId: string, @Body() body: StaffActionDto) {
    return this.queue.callNext(branchId, serviceId, actor.organizationId, body.counterId);
  }

  @Post("tickets/:ticketId/start")
  start(@CurrentUser() actor: SessionUser, @Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "SERVING", actor.organizationId);
  }

  @Post("tickets/:ticketId/complete")
  complete(@CurrentUser() actor: SessionUser, @Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "COMPLETED", actor.organizationId);
  }

  @Post("tickets/:ticketId/no-show")
  noShow(@CurrentUser() actor: SessionUser, @Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "NO_SHOW", actor.organizationId);
  }

  @Post("tickets/:ticketId/recall")
  recall(@CurrentUser() actor: SessionUser, @Param("ticketId") ticketId: string) {
    return this.queue.recallTicket(ticketId, actor.organizationId);
  }

  @Post("tickets/:ticketId/requeue")
  requeue(@CurrentUser() actor: SessionUser, @Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "WAITING", actor.organizationId);
  }

  @Post("tickets/:ticketId/cancel")
  cancel(@CurrentUser() actor: SessionUser, @Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "CANCELLED", actor.organizationId);
  }

  @Post("tickets/:ticketId/transfer")
  transfer(@CurrentUser() actor: SessionUser, @Param("ticketId") ticketId: string, @Body() body: TransferDto) {
    return this.queue.transferTicket(ticketId, body.serviceId, actor.organizationId);
  }
}
