import { Controller, Get, Header, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../decorators/current-user.decorator.js";
import { Roles } from "../decorators/roles.decorator.js";
import { RolesGuard } from "../guards/roles.guard.js";
import type { SessionUser } from "../guards/session.guard.js";
import { AnalyticsService } from "../services/analytics.service.js";

@Controller("analytics")
@UseGuards(RolesGuard)
@Roles("OWNER", "ADMIN", "BRANCH_MANAGER")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("summary")
  summary(@CurrentUser() actor: SessionUser, @Query("start") start?: string, @Query("end") end?: string, @Query("branchId") branchId?: string) {
    return this.analytics.summary(actor.organizationId, start, end, branchId);
  }

  @Get("tickets.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async ticketsCsv(@CurrentUser() actor: SessionUser, @Res() response: Response, @Query("start") start?: string, @Query("end") end?: string, @Query("branchId") branchId?: string) {
    const csv = await this.analytics.ticketsCsv(actor.organizationId, start, end, branchId);
    response.header("Content-Disposition", "attachment; filename=\"qms-tickets.csv\"");
    response.send(csv);
  }
}
