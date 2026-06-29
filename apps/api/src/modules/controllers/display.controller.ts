import { Controller, Get, Param } from "@nestjs/common";
import { QueueService } from "../services/queue.service.js";

@Controller("display")
export class DisplayController {
  constructor(private readonly queue: QueueService) {}

  @Get(":branchId")
  snapshot(@Param("branchId") branchId: string) {
    return this.queue.snapshot(branchId);
  }
}

