import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../services/prisma.service.js";

@Controller("admin")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("bootstrap")
  async bootstrap() {
    const branch = await this.prisma.branch.findFirst({
      include: {
        counters: { orderBy: { nameEn: "asc" } },
        services: { orderBy: { prefix: "asc" } }
      }
    });

    return { branch };
  }
}

