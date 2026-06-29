import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { PrismaService } from "../services/prisma.service.js";

@Controller("public")
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("bootstrap")
  async bootstrap() {
    const branch = await this.prisma.branch.findFirst({
      include: {
        counters: { where: { isOpen: true }, orderBy: { nameEn: "asc" } },
        services: { where: { isActive: true }, orderBy: { prefix: "asc" } }
      }
    });

    return { branch };
  }

  @Get("branches/:slug")
  async branch(@Param("slug") slug: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { slug },
      include: {
        counters: { where: { isOpen: true }, orderBy: { nameEn: "asc" } },
        services: { where: { isActive: true }, orderBy: { prefix: "asc" } }
      }
    });
    if (!branch) throw new NotFoundException("Branch not found");
    return { branch };
  }
}
