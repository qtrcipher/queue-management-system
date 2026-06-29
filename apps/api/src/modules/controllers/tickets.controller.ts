import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { IsEmail, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { clientIdentifier } from "../security.js";
import { QueueService } from "../services/queue.service.js";

const MAX_PUBLIC_TICKETS = 20;
const PUBLIC_TICKET_WINDOW_MS = 5 * 60 * 1000;

type PublicTicketAttempt = {
  count: number;
  resetAt: number;
};

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

  @IsEmail()
  @IsOptional()
  customerEmail?: string;
}

@Controller("tickets")
export class TicketsController {
  private readonly publicTicketAttempts = new Map<string, PublicTicketAttempt>();

  constructor(private readonly queue: QueueService) {}

  @Post()
  create(@Req() request: Request, @Body() body: CreateTicketDto) {
    this.assertPublicTicketAllowed(clientIdentifier(request));
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

  private assertPublicTicketAllowed(clientId: string) {
    const now = Date.now();
    const existing = this.publicTicketAttempts.get(clientId);
    const attempt = existing && now < existing.resetAt
      ? { count: existing.count + 1, resetAt: existing.resetAt }
      : { count: 1, resetAt: now + PUBLIC_TICKET_WINDOW_MS };
    this.publicTicketAttempts.set(clientId, attempt);

    if (attempt.count > MAX_PUBLIC_TICKETS) {
      throw new HttpException("Too many tickets created. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
