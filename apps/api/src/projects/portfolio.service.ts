import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../tenancy/access.service";
import { JwtPayload } from "../auth/jwt-payload";
import {
  PACING_WINDOW_DAYS,
  cplFromSpend,
  pacingPercent,
  pacingTone,
  toFiniteNumber,
  type PacingTone,
} from "./portfolio.metrics";

export type PortfolioCampaignStatus = "active" | "paused" | "archived" | "none";

export type PortfolioRow = {
  id: string;
  name: string;
  projectStatus: string;
  platforms: string[];
  campaignStatus: PortfolioCampaignStatus;
  websiteUrl: string | null;
  dailyBudget: number | null;
  spend7d: number;
  spend30d: number;
  conversions7d: number;
  conversions30d: number;
  cpl7d: number | null;
  pacingPercent: number | null;
  pacingTone: PacingTone;
  openRecommendations: number;
  unreadAlerts: number;
  hasUnreadAlerts: boolean;
  lastActionAt: string | null;
  favorite: boolean;
};

type RawPortfolioRow = {
  id: string;
  name: string;
  project_status: string;
  primary_platform: string;
  website_url: string | null;
  platforms: string[] | null;
  campaign_status: string | null;
  daily_budget: unknown;
  spend_7d: unknown;
  spend_30d: unknown;
  conversions_7d: unknown;
  conversions_30d: unknown;
  open_recommendations: unknown;
  unread_alerts: unknown;
  last_action_at: Date | string | null;
  favorite: boolean | number | string;
};

const CAMPAIGN_STATUSES = new Set<PortfolioCampaignStatus>([
  "active",
  "paused",
  "archived",
  "none",
]);

export function mapPortfolioRow(raw: RawPortfolioRow): PortfolioRow {
  const dailyBudgetRaw = raw.daily_budget;
  const dailyBudget =
    dailyBudgetRaw == null || dailyBudgetRaw === ""
      ? null
      : toFiniteNumber(dailyBudgetRaw);
  const spend7d = toFiniteNumber(raw.spend_7d);
  const conversions7d = Math.round(toFiniteNumber(raw.conversions_7d));
  const unreadAlerts = Math.round(toFiniteNumber(raw.unread_alerts));
  const campaignRaw = (raw.campaign_status ?? "none") as string;
  const campaignStatus = CAMPAIGN_STATUSES.has(
    campaignRaw as PortfolioCampaignStatus,
  )
    ? (campaignRaw as PortfolioCampaignStatus)
    : "none";
  const platforms = Array.isArray(raw.platforms)
    ? [...new Set(raw.platforms.filter(Boolean))]
    : [raw.primary_platform].filter(Boolean);
  const percent = pacingPercent(
    spend7d,
    dailyBudget && dailyBudget > 0 ? dailyBudget : null,
    PACING_WINDOW_DAYS,
  );
  const last = raw.last_action_at;
  return {
    id: raw.id,
    name: raw.name,
    projectStatus: raw.project_status,
    platforms,
    campaignStatus,
    websiteUrl: raw.website_url,
    dailyBudget: dailyBudget && dailyBudget > 0 ? dailyBudget : null,
    spend7d,
    spend30d: toFiniteNumber(raw.spend_30d),
    conversions7d,
    conversions30d: Math.round(toFiniteNumber(raw.conversions_30d)),
    cpl7d: cplFromSpend(spend7d, conversions7d),
    pacingPercent: percent,
    pacingTone: pacingTone(percent),
    openRecommendations: Math.round(toFiniteNumber(raw.open_recommendations)),
    unreadAlerts,
    hasUnreadAlerts: unreadAlerts > 0,
    lastActionAt:
      last instanceof Date
        ? last.toISOString()
        : last
          ? new Date(last).toISOString()
          : null,
    favorite:
      raw.favorite === true || raw.favorite === 1 || raw.favorite === "t",
  };
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async listForUser(user: JwtPayload): Promise<PortfolioRow[]> {
    const scopedClause = this.access.isOrgWide(user.role)
      ? Prisma.empty
      : Prisma.sql`AND EXISTS (
          SELECT 1 FROM project_access pa
          WHERE pa.project_id = p.id AND pa.user_id = ${user.sub}::uuid
        )`;

    const rows = await this.prisma.$queryRaw<RawPortfolioRow[]>`
      SELECT
        p.id,
        p.name,
        p.status::text AS project_status,
        p.primary_platform::text AS primary_platform,
        p.website_url,
        (
          SELECT COALESCE(array_agg(DISTINCT plat), ARRAY[p.primary_platform::text])
          FROM (
            SELECT p.primary_platform::text AS plat
            UNION
            SELECT c.platform::text
            FROM ad_platform_credentials c
            WHERE c.project_id = p.id
          ) platforms
        ) AS platforms,
        COALESCE(
          (
            SELECT 'active'
            FROM campaigns camp
            WHERE camp.project_id = p.id AND camp.status = 'active'
            LIMIT 1
          ),
          (
            SELECT 'paused'
            FROM campaigns camp
            WHERE camp.project_id = p.id AND camp.status = 'paused'
            LIMIT 1
          ),
          (
            SELECT 'archived'
            FROM campaigns camp
            WHERE camp.project_id = p.id AND camp.status = 'archived'
            LIMIT 1
          ),
          'none'
        ) AS campaign_status,
        (
          SELECT (b.payload_json #>> '{project,budget,daily}')::numeric
          FROM project_briefs b
          WHERE b.project_id = p.id
          ORDER BY b.version DESC
          LIMIT 1
        ) AS daily_budget,
        (
          SELECT COALESCE(SUM(s.spend), 0)
          FROM performance_snapshots s
          WHERE s.project_id = p.id
            AND s.date >= (CURRENT_DATE - INTERVAL '6 days')
        ) AS spend_7d,
        (
          SELECT COALESCE(SUM(s.spend), 0)
          FROM performance_snapshots s
          WHERE s.project_id = p.id
            AND s.date >= (CURRENT_DATE - INTERVAL '29 days')
        ) AS spend_30d,
        (
          SELECT COALESCE(SUM(s.conversions), 0)
          FROM performance_snapshots s
          WHERE s.project_id = p.id
            AND s.date >= (CURRENT_DATE - INTERVAL '6 days')
        ) AS conversions_7d,
        (
          SELECT COALESCE(SUM(s.conversions), 0)
          FROM performance_snapshots s
          WHERE s.project_id = p.id
            AND s.date >= (CURRENT_DATE - INTERVAL '29 days')
        ) AS conversions_30d,
        (
          SELECT COUNT(*)::int
          FROM optimization_recommendations r
          WHERE r.project_id = p.id
            AND r.status IN ('proposed', 'approved', 'failed')
        ) AS open_recommendations,
        (
          SELECT COUNT(*)::int
          FROM ops_alerts a
          WHERE a.project_id = p.id
            AND a.acknowledged_at IS NULL
        ) AS unread_alerts,
        (
          SELECT MAX(w.created_at)
          FROM ad_write_audit w
          WHERE w.project_id = p.id
        ) AS last_action_at,
        EXISTS (
          SELECT 1 FROM project_favorites f
          WHERE f.project_id = p.id AND f.user_id = ${user.sub}::uuid
        ) AS favorite
      FROM projects p
      WHERE p.organization_id = ${user.organizationId}::uuid
      ${scopedClause}
      ORDER BY p.created_at DESC
    `;
    return rows.map(mapPortfolioRow);
  }

  async setFavorite(
    user: JwtPayload,
    projectId: string,
    favorite: boolean,
  ): Promise<{ ok: true; favorite: boolean }> {
    await this.access.assertProject(user, projectId, "read");
    if (favorite) {
      await this.prisma.projectFavorite.upsert({
        where: {
          userId_projectId: { userId: user.sub, projectId },
        },
        create: { userId: user.sub, projectId },
        update: {},
      });
    } else {
      await this.prisma.projectFavorite.deleteMany({
        where: { userId: user.sub, projectId },
      });
    }
    return { ok: true, favorite };
  }
}
