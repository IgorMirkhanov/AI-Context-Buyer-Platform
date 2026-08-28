import {
  countOpenRecommendations,
  countUnreadAlerts,
  cplFromSpend,
  expectedSpend,
  pacingPercent,
  pacingTone,
} from "./portfolio.metrics";
import { mapPortfolioRow } from "./portfolio.service";

describe("portfolio pacing", () => {
  it("treats spend vs 7× daily budget as percent of expected", () => {
    expect(expectedSpend(1000, 7)).toBe(7000);
    expect(pacingPercent(3500, 1000, 7)).toBe(50);
    expect(pacingPercent(7000, 1000, 7)).toBe(100);
    expect(pacingPercent(9800, 1000, 7)).toBe(140);
  });

  it("returns null pacing without a positive daily budget", () => {
    expect(pacingPercent(500, null, 7)).toBeNull();
    expect(pacingPercent(500, 0, 7)).toBeNull();
    expect(pacingTone(null)).toBe("unknown");
  });

  it("marks under / on-track / over spend", () => {
    expect(pacingTone(50)).toBe("under");
    expect(pacingTone(79.9)).toBe("under");
    expect(pacingTone(80)).toBe("on_track");
    expect(pacingTone(120)).toBe("on_track");
    expect(pacingTone(120.1)).toBe("over");
  });
});

describe("portfolio open recommendations and alerts", () => {
  it("counts proposed, approved and failed as open, skips applied/rejected", () => {
    expect(
      countOpenRecommendations([
        "proposed",
        "approved",
        "failed",
        "applied",
        "rejected",
        "proposed",
      ]),
    ).toBe(4);
  });

  it("counts only unacknowledged ops alerts", () => {
    const now = new Date("2026-08-28T10:00:00.000Z");
    expect(
      countUnreadAlerts([
        { acknowledgedAt: null },
        { acknowledgedAt: now },
        { acknowledgedAt: null },
      ]),
    ).toBe(2);
  });

  it("computes CPL only when there are conversions", () => {
    expect(cplFromSpend(1500, 5)).toBe(300);
    expect(cplFromSpend(1500, 0)).toBeNull();
  });
});

describe("mapPortfolioRow", () => {
  it("maps aggregated SQL totals onto pacing, CPL and alert flag", () => {
    const row = mapPortfolioRow({
      id: "p1",
      name: "Shop",
      project_status: "active",
      primary_platform: "yandex_direct",
      website_url: "https://shop.example",
      platforms: ["yandex_direct"],
      campaign_status: "paused",
      daily_budget: "5000",
      spend_7d: "17500",
      spend_30d: "40000",
      conversions_7d: 5,
      conversions_30d: 12,
      open_recommendations: 3,
      unread_alerts: 2,
      last_action_at: new Date("2026-08-27T12:00:00.000Z"),
      favorite: true,
    });
    expect(row.pacingPercent).toBe(50);
    expect(row.pacingTone).toBe("under");
    expect(row.cpl7d).toBe(3500);
    expect(row.openRecommendations).toBe(3);
    expect(row.unreadAlerts).toBe(2);
    expect(row.hasUnreadAlerts).toBe(true);
    expect(row.campaignStatus).toBe("paused");
    expect(row.favorite).toBe(true);
    expect(row.lastActionAt).toBe("2026-08-27T12:00:00.000Z");
  });

  it("does not count acknowledged-style zero alerts as unread", () => {
    const row = mapPortfolioRow({
      id: "p2",
      name: "Quiet",
      project_status: "draft",
      primary_platform: "google_ads",
      website_url: null,
      platforms: ["google_ads"],
      campaign_status: "none",
      daily_budget: null,
      spend_7d: 0,
      spend_30d: 0,
      conversions_7d: 0,
      conversions_30d: 0,
      open_recommendations: 0,
      unread_alerts: 0,
      last_action_at: null,
      favorite: false,
    });
    expect(row.hasUnreadAlerts).toBe(false);
    expect(row.pacingPercent).toBeNull();
    expect(row.pacingTone).toBe("unknown");
    expect(row.cpl7d).toBeNull();
    expect(row.campaignStatus).toBe("none");
  });
});
