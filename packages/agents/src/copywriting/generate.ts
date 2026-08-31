import { SemanticCluster } from "../semantic/types";
import {
  AdVariant,
  clipToLimit,
  ClusterCreatives,
  containsForbidden,
  CopyMarketing,
  limitOf,
  PlatformLimit,
  sanitizeForbidden,
} from "./limits";

export type Copywriter = {
  writeCluster(
    cluster: SemanticCluster,
    marketing: CopyMarketing,
    limits: PlatformLimit[],
  ): ClusterCreatives | Promise<ClusterCreatives>;
};

/**
 * Детерминированный копирайтер (мок LLM): УТП обязательно, forbidden режется
 * на этапе генерации, 2 A/B варианта, длины берутся из справочника лимитов.
 */
export class HeuristicCopywriter implements Copywriter {
  writeCluster(
    cluster: SemanticCluster,
    marketing: CopyMarketing,
    limits: PlatformLimit[],
  ): ClusterCreatives {
    const uspA = marketing.usp[0] ?? cluster.cluster_name;
    const uspB = marketing.usp[1] ?? uspA;
    const audience = marketing.target_audience[0]?.segment ?? "";

    return sanitizeClusterCreatives(
      {
        cluster_name: cluster.cluster_name,
        ab_variants: 2,
        ads: [
          {
            ab_group: "A",
            headline1: cluster.cluster_name,
            headline2: uspA,
            description: `${uspA}. ${audience}`.trim(),
            sitelinks: [...marketing.usp],
            callouts: [...marketing.usp],
          },
          {
            ab_group: "B",
            headline1: `${cluster.cluster_name} — купить`,
            headline2: uspB,
            description: `${uspB}. ${cluster.cluster_name}`.trim(),
            sitelinks: [...marketing.usp],
            callouts: [...marketing.usp],
          },
        ],
      },
      marketing,
      limits,
    );
  }
}

/** Фильтр на этапе генерации: forbidden режется до пост-валидации. */
export function sanitizeClusterCreatives(
  cluster: ClusterCreatives,
  marketing: CopyMarketing,
  limits: PlatformLimit[],
): ClusterCreatives {
  const h1 = limitOf(limits, "headline1");
  const h2 = limitOf(limits, "headline2");
  const desc = limitOf(limits, "description");
  const sitelink = limitOf(limits, "sitelink");
  const callout = limitOf(limits, "callout");
  const forbidden = marketing.forbidden_phrases;

  const ads = cluster.ads.map((ad) => {
    const next: AdVariant = {
      ab_group: ad.ab_group,
      headline1: fit(ad.headline1, h1.maxLength, forbidden),
      headline2: fit(ad.headline2, h2.maxLength, forbidden),
      description: fit(ad.description, desc.maxLength, forbidden),
      sitelinks: uniqueFit(ad.sitelinks, sitelink.maxLength, sitelink.maxCount, forbidden),
      callouts: uniqueFit(ad.callouts, callout.maxLength, callout.maxCount, forbidden),
    };
    if (!next.headline1) {
      next.headline1 = fit(cluster.cluster_name, h1.maxLength, forbidden);
    }
    if (!next.description) {
      next.description = fit(
        marketing.usp[0] ?? cluster.cluster_name,
        desc.maxLength,
        forbidden,
      );
    }
    assertUspUsed(next, marketing.usp);
    assertNoForbidden(next, forbidden);
    return next;
  });

  return {
    cluster_name: cluster.cluster_name,
    ab_variants: Math.max(cluster.ab_variants, ads.length),
    ads,
  };
}

function fit(
  text: string,
  maxLength: number,
  forbidden: string[],
): string {
  return clipToLimit(sanitizeForbidden(text, forbidden), maxLength);
}

function uniqueFit(
  items: string[],
  maxLength: number,
  maxCount: number,
  forbidden: string[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const value = fit(item, maxLength, forbidden);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= maxCount) break;
  }
  return result;
}

function assertUspUsed(
  ad: { headline1: string; headline2: string; description: string },
  usp: string[],
): void {
  if (usp.length === 0) return;
  const blob = `${ad.headline1} ${ad.headline2} ${ad.description}`.toLowerCase();
  const ok = usp.some((item) =>
    blob.includes(item.toLowerCase().slice(0, Math.min(12, item.length))),
  );
  if (!ok) {
    throw new Error("Copywriting agent omitted USP");
  }
}

function assertNoForbidden(
  ad: {
    headline1: string;
    headline2: string;
    description: string;
    sitelinks: string[];
    callouts: string[];
  },
  forbidden: string[],
): void {
  const texts = [
    ad.headline1,
    ad.headline2,
    ad.description,
    ...ad.sitelinks,
    ...ad.callouts,
  ];
  for (const text of texts) {
    const hit = containsForbidden(text, forbidden);
    if (hit) {
      throw new Error(`Forbidden phrase leaked into copy: ${hit}`);
    }
  }
}
