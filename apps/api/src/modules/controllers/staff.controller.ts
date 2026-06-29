import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { SessionGuard } from "../guards/session.guard.js";
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
@UseGuards(SessionGuard)
export class StaffController {
  constructor(private readonly queue: QueueService) {}

  @Post(":branchId/services/:serviceId/call-next")
  callNext(@Param("branchId") branchId: string, @Param("serviceId") serviceId: string, @Body() body: StaffActionDto) {
    return this.queue.callNext(branchId, serviceId, body.counterId);
  }

  @Post("tickets/:ticketId/start")
  start(@Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "SERVING");
  }

  @Post("tickets/:ticketId/complete")
  complete(@Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "COMPLETED");
  }

  @Post("tickets/:ticketId/no-show")
  noShow(@Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "NO_SHOW");
  }

  @Post("tickets/:ticketId/recall")
  recall(@Param("ticketId") ticketId: string) {
    return this.queue.recallTicket(ticketId);
  }

  @Post("tickets/:ticketId/requeue")
  requeue(@Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "WAITING");
  }

  @Post("tickets/:ticketId/cancel")
  cancel(@Param("ticketId") ticketId: string) {
    return this.queue.updateTicket(ticketId, "CANCELLED");
  }

  @Post("tickets/:ticketId/transfer")
  transfer(@Param("ticketId") ticketId: string, @Body() body: TransferDto) {
    return this.queue.transferTicket(ticketId, body.serviceId);
  }
}
