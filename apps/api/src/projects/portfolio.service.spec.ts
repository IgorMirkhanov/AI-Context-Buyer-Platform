import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../tenancy/access.service";
import { JwtPayload } from "../auth/jwt-payload";
import { PortfolioService } from "./portfolio.service";

describe("PortfolioService", () => {
  const prisma = {
    $queryRaw: jest.fn(),
    project: { findFirst: jest.fn() },
    projectAccess: { findUnique: jest.fn() },
    projectFavorite: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  let service: PortfolioService;

  const owner: JwtPayload = {
    sub: "user-owner",
    organizationId: "org-a",
    email: "owner@agency.test",
    role: "owner",
  };
  const client: JwtPayload = {
    sub: "user-client",
    organizationId: "org-a",
    email: "c@x.test",
    role: "client",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PortfolioService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AccessService,
          useFactory: () =>
            new AccessService(prisma as unknown as PrismaService),
        },
      ],
    }).compile();
    service = module.get(PortfolioService);
  });

  it("runs one aggregating query scoped to the organization", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await service.listForUser(owner);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = JSON.stringify(prisma.$queryRaw.mock.calls[0]);
    expect(sql).toContain("performance_snapshots");
    expect(sql).toContain("optimization_recommendations");
    expect(sql).toContain("ops_alerts");
    expect(sql).toContain("ad_write_audit");
    expect(sql).toContain("organization_id");
  });

  it("restricts the query to granted projects for a client", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await service.listForUser(client);
    const sql = JSON.stringify(prisma.$queryRaw.mock.calls[0]);
    expect(sql).toContain("project_access");
  });

  it("lets a client star an assigned project", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    prisma.projectAccess.findUnique.mockResolvedValue({ id: "g1" });
    prisma.projectFavorite.upsert.mockResolvedValue({});
    await expect(service.setFavorite(client, "p1", true)).resolves.toEqual({
      ok: true,
      favorite: true,
    });
    expect(prisma.projectFavorite.upsert).toHaveBeenCalled();
  });

  it("does not star a project from another organization", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.setFavorite(owner, "p-other", true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.projectFavorite.upsert).not.toHaveBeenCalled();
  });

  it("does not let a client star a project without access", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    prisma.projectAccess.findUnique.mockResolvedValue(null);
    await expect(service.setFavorite(client, "p1", true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("maps unread alerts from the aggregated row", async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: "p-alert",
        name: "With alert",
        project_status: "active",
        primary_platform: "yandex_direct",
        website_url: null,
        platforms: ["yandex_direct"],
        campaign_status: "active",
        daily_budget: 1000,
        spend_7d: 7000,
        spend_30d: 20000,
        conversions_7d: 10,
        conversions_30d: 20,
        open_recommendations: 1,
        unread_alerts: 1,
        last_action_at: null,
        favorite: false,
      },
    ]);
    const rows = await service.listForUser(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0].hasUnreadAlerts).toBe(true);
    expect(rows[0].pacingPercent).toBe(100);
    expect(rows[0].pacingTone).toBe("on_track");
    expect(rows[0].openRecommendations).toBe(1);
  });
});
