import { Body, Controller, Param, Post } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { QueueService } from "../services/queue.service.js";

class StaffActionDto {
  @IsString()
  @IsOptional()
  counterId?: string;
}

@Controller("staff")
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
}

