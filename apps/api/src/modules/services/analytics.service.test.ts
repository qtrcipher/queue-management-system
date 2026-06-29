import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics.service.js";

describe("AnalyticsService", () => {
  it("returns branch dashboard rows for the selected date range", async () => {
    const issuedAt = new Date("2026-06-29T08:00:00.000Z");
    const calledAt = new Date("2026-06-29T08:12:00.000Z");
    const prisma = {
      ticket: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "ticket-1",
            branchId: "branch-1",
            serviceId: "service-1",
            status: "COMPLETED",
            issuedAt,
            calledAt,
            startedAt: new Date("2026-06-29T08:15:00.000Z"),
            completedAt: new Date("2026-06-29T08:25:00.000Z"),
            service: { id: "service-1", prefix: "A", nameEn: "General", nameAr: "عام" },
            branch: { id: "branch-1", slug: "main", nameEn: "Main Branch", nameAr: "الفرع الرئيسي" },
            counter: null
          }
        ])
      },
      branch: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "branch-1",
            slug: "main",
            nameEn: "Main Branch",
            nameAr: "الفرع الرئيسي",
            services: [{ isActive: true }, { isActive: false }],
            counters: [{ isOpen: true }, { isOpen: false }],
            tickets: [{ status: "COMPLETED", issuedAt, calledAt }]
          },
          {
            id: "branch-2",
            slug: "north",
            nameEn: "North Branch",
            nameAr: "فرع الشمال",
            services: [{ isActive: true }],
            counters: [{ isOpen: true }],
            tickets: []
          }
        ])
      }
    };

    const summary = await new AnalyticsService(prisma as never).summary("org-1", "2026-06-29", "2026-06-29");

    expect(prisma.branch.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      include: {
        counters: true,
        services: true,
        tickets: {
          where: {
            issuedAt: {
              gte: new Date("2026-06-29T00:00:00.000Z"),
              lt: new Date("2026-06-30T00:00:00.000Z")
            }
          },
          orderBy: { issuedAt: "asc" }
        }
      },
      orderBy: { nameEn: "asc" }
    });
    expect(summary.branchDashboard).toEqual([
      {
        branchId: "branch-1",
        slug: "main",
        nameEn: "Main Branch",
        nameAr: "الفرع الرئيسي",
        services: 1,
        openCounters: 1,
        issued: 1,
        waiting: 0,
        serving: 0,
        completed: 1,
        noShow: 0,
        averageWaitMinutes: 12
      },
      {
        branchId: "branch-2",
        slug: "north",
        nameEn: "North Branch",
        nameAr: "فرع الشمال",
        services: 1,
        openCounters: 1,
        issued: 0,
        waiting: 0,
        serving: 0,
        completed: 0,
        noShow: 0,
        averageWaitMinutes: 0
      }
    ]);
  });
});
