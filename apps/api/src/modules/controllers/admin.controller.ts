import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { SessionGuard } from "../guards/session.guard.js";
import { PrismaService } from "../services/prisma.service.js";

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

@Controller("admin")
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

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
}
