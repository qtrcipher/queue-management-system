import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "argon2";

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: "seed-org" },
    update: {},
    create: {
      id: "seed-org",
      name: "Demo Organization",
      ticketRetentionDays: 365,
      smtpHost: process.env.SMTP_HOST ?? "localhost",
      smtpPort: Number(process.env.SMTP_PORT ?? 1025),
      smtpFrom: process.env.SMTP_FROM ?? "QMS <no-reply@example.com>",
      ticketEmailSubject: "Your queue ticket is {{code}}",
      ticketEmailBody: "Your ticket number is {{code}} for {{serviceName}}. Track it at {{ticketUrl}}.",
      ticketSmsTemplate: "Your queue ticket is {{code}}"
    }
  });

  const branch = await prisma.branch.upsert({
    where: { slug: "main" },
    update: {},
    create: {
      organizationId: organization.id,
      slug: "main",
      nameEn: "Main Branch",
      nameAr: "الفرع الرئيسي"
    }
  });

  await prisma.service.upsert({
    where: { branchId_prefix: { branchId: branch.id, prefix: "A" } },
    update: {},
    create: {
      branchId: branch.id,
      nameEn: "General Service",
      nameAr: "الخدمة العامة",
      prefix: "A"
    }
  });

  await prisma.service.upsert({
    where: { branchId_prefix: { branchId: branch.id, prefix: "B" } },
    update: {},
    create: {
      branchId: branch.id,
      nameEn: "Priority Service",
      nameAr: "خدمة الأولوية",
      prefix: "B"
    }
  });

  await prisma.counter.upsert({
    where: { branchId_nameEn: { branchId: branch.id, nameEn: "Counter 1" } },
    update: {},
    create: { branchId: branch.id, nameEn: "Counter 1", nameAr: "الكاونتر ١" }
  });

  await prisma.counter.upsert({
    where: { branchId_nameEn: { branchId: branch.id, nameEn: "Counter 2" } },
    update: {},
    create: { branchId: branch.id, nameEn: "Counter 2", nameAr: "الكاونتر ٢" }
  });

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      organizationId: organization.id,
      email: "admin@example.com",
      name: "Admin",
      role: UserRole.OWNER,
      passwordHash: await hash("admin12345")
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
