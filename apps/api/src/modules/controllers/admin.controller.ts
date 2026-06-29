import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { hash } from "argon2";
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from "class-validator";
import { CurrentUser } from "../decorators/current-user.decorator.js";
import { Roles } from "../decorators/roles.decorator.js";
import { RolesGuard } from "../guards/roles.guard.js";
import type { SessionUser } from "../guards/session.guard.js";
import { PrismaService } from "../services/prisma.service.js";
import { RetentionService } from "../services/retention.service.js";

class CreateBranchDto {
  @IsString()
  @MinLength(2)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  nameAr!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;
}

class CreateServiceDto {
  @IsString()
  @MinLength(2)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  nameAr!: string;

  @IsString()
  @Matches(/^[A-Z0-9]{1,4}$/)
  prefix!: string;
}

class UpdateServiceDto {
  @IsString()
  @IsOptional()
  nameEn?: string;

  @IsString()
  @IsOptional()
  nameAr?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

class CreateCounterDto {
  @IsString()
  @MinLength(2)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  nameAr!: string;
}

class UpdateCounterDto {
  @IsString()
  @IsOptional()
  nameEn?: string;

  @IsString()
  @IsOptional()
  nameAr?: string;

  @IsBoolean()
  @IsOptional()
  isOpen?: boolean;
}

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  name?: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  password?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}

class UpdateOrganizationSettingsDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  ticketRetentionDays!: number;
}

@Controller("admin")
@UseGuards(RolesGuard)
@Roles("OWNER", "ADMIN")
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: RetentionService
  ) {}

  @Get("bootstrap")
  async overview() {
    const organization = await this.prisma.organization.findFirst({
      include: {
        branches: {
          include: {
            counters: { orderBy: { nameEn: "asc" } },
            services: { orderBy: { prefix: "asc" } }
          },
          orderBy: { nameEn: "asc" }
        },
        users: {
          select: { id: true, email: true, name: true, role: true, createdAt: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    return { organization };
  }

  @Post("branches")
  async createBranch(@Body() body: CreateBranchDto) {
    const organization = await this.prisma.organization.findFirstOrThrow();
    return this.prisma.branch.create({
      data: { organizationId: organization.id, nameEn: body.nameEn, nameAr: body.nameAr, slug: body.slug },
      include: { counters: true, services: true }
    });
  }

  @Patch("organization/settings")
  async updateOrganizationSettings(@CurrentUser() actor: SessionUser, @Body() body: UpdateOrganizationSettingsDto) {
    const updated = await this.prisma.organization.update({
      where: { id: actor.organizationId },
      data: { ticketRetentionDays: body.ticketRetentionDays },
      select: { id: true, name: true, ticketRetentionDays: true }
    });

    await this.prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "organization.settings.updated",
        entity: "organization",
        entityId: actor.organizationId,
        metadata: { ticketRetentionDays: updated.ticketRetentionDays }
      }
    });

    return updated;
  }

  @Post("maintenance/purge-tickets")
  purgeTickets(@CurrentUser() actor: SessionUser) {
    return this.retention.purgeTerminalTickets(actor.organizationId, actor.id);
  }

  @Post("branches/:branchId/services")
  async createService(@Param("branchId") branchId: string, @Body() body: CreateServiceDto) {
    return this.prisma.service.create({
      data: { branchId, nameEn: body.nameEn, nameAr: body.nameAr, prefix: body.prefix.toUpperCase() }
    });
  }

  @Patch("services/:serviceId")
  async updateService(@Param("serviceId") serviceId: string, @Body() body: UpdateServiceDto) {
    return this.prisma.service.update({ where: { id: serviceId }, data: body });
  }

  @Post("branches/:branchId/counters")
  async createCounter(@Param("branchId") branchId: string, @Body() body: CreateCounterDto) {
    return this.prisma.counter.create({ data: { branchId, nameEn: body.nameEn, nameAr: body.nameAr } });
  }

  @Patch("counters/:counterId")
  async updateCounter(@Param("counterId") counterId: string, @Body() body: UpdateCounterDto) {
    return this.prisma.counter.update({ where: { id: counterId }, data: body });
  }

  @Post("users")
  async createUser(@CurrentUser() user: SessionUser, @Body() body: CreateUserDto) {
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    const created = await this.prisma.user.create({
      data: {
        organizationId: organization.id,
        email: body.email.toLowerCase(),
        name: body.name,
        role: body.role,
        passwordHash: await hash(body.password)
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });

    await this.prisma.auditEvent.create({
      data: { actorId: user.id, action: "user.created", entity: "user", entityId: created.id, metadata: { role: created.role } }
    });

    return created;
  }

  @Patch("users/:userId")
  async updateUser(@CurrentUser() actor: SessionUser, @Param("userId") userId: string, @Body() body: UpdateUserDto) {
    const data: { name?: string; role?: UserRole; passwordHash?: string } = {};
    if (body.name) data.name = body.name;
    if (body.role) data.role = body.role;
    if (body.password) data.passwordHash = await hash(body.password);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });

    await this.prisma.auditEvent.create({
      data: { actorId: actor.id, action: "user.updated", entity: "user", entityId: updated.id, metadata: { role: updated.role } }
    });

    return updated;
  }
}
