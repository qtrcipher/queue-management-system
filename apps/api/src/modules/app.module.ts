import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminController } from "./controllers/admin.controller.js";
import { AnalyticsController } from "./controllers/analytics.controller.js";
import { AuthController } from "./controllers/auth.controller.js";
import { DisplayController } from "./controllers/display.controller.js";
import { HealthController } from "./controllers/health.controller.js";
import { PublicController } from "./controllers/public.controller.js";
import { StaffController } from "./controllers/staff.controller.js";
import { TicketsController } from "./controllers/tickets.controller.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { SessionGuard } from "./guards/session.guard.js";
import { QueueGateway } from "./queue.gateway.js";
import { AnalyticsService } from "./services/analytics.service.js";
import { AuthService } from "./services/auth.service.js";
import { NotificationsService } from "./services/notifications.service.js";
import { PrismaService } from "./services/prisma.service.js";
import { QueueService } from "./services/queue.service.js";
import { RetentionService } from "./services/retention.service.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AdminController, AnalyticsController, AuthController, DisplayController, HealthController, PublicController, StaffController, TicketsController],
  providers: [AnalyticsService, AuthService, NotificationsService, PrismaService, QueueGateway, QueueService, RetentionService, RolesGuard, SessionGuard]
})
export class AppModule {}
