import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { QueueService } from "../services/queue.service.js";

class CreateTicketDto {
  @IsString()
  branchId!: string;

  @IsString()
  serviceId!: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;
}

@Controller("tickets")
export class TicketsController {
  constructor(private readonly queue: QueueService) {}

  @Post()
  create(@Body() body: CreateTicketDto) {
    return this.queue.createTicket(body);
  }

  @Get(":ticketId")
  get(@Param("ticketId") ticketId: string) {
    return this.queue.getTicket(ticketId);
  }

  @Get(":ticketId/status")
  status(@Param("ticketId") ticketId: string) {
    return this.queue.getTicketStatus(ticketId);
  }
}
