import { SemanticCore } from "../semantic/types";
import {
  ClusterCreatives,
  containsForbidden,
  CopyMarketing,
  normalize,
  PlatformLimit,
} from "../copywriting/limits";

export type ValidationIssueDraft = {
  clusterName?: string;
  abGroup?: string;
  elementType?: string;
  text?: string;
  level: "critical" | "warning";
  code: string;
  message: string;
  autoFixed: boolean;
  fixedText?: string;
};

export type ValidationResult = {
  creatives: ClusterCreatives[];
  issues: ValidationIssueDraft[];
};

const RISKY_PHRASES = [
  "лучший",
  "самое",
  "самый",
  "самая",
  "#1",
  "№1",
  "номер один",
  "гарантия 100%",
];

export function validateCreatives(
  creatives: ClusterCreatives[],
  core: SemanticCore,
  marketing: CopyMarketing,
  limits: PlatformLimit[],
): ValidationResult {
  const issues: ValidationIssueDraft[] = [];
  const next = creatives.map((cluster) => ({
    ...cluster,
    ads: cluster.ads.map((ad) => ({ ...ad, sitelinks: [...ad.sitelinks], callouts: [...ad.callouts] })),
  }));

  applyLimitChecks(next, limits, issues);
  applyForbiddenChecks(next, marketing.forbidden_phrases, issues);
  applyRiskyPhraseChecks(next, issues);
  applyDedupChecks(next, issues);
  applyUspChecks(next, marketing.usp, issues);
  applyGeoLanguageChecks(next, marketing.geo, issues);
  applyKeywordDedup(core, issues);
  applyCrossClusterKeywordCheck(core, issues);

  return { creatives: next, issues };
}

function applyLimitChecks(
  creatives: ClusterCreatives[],
  limits: PlatformLimit[],
  issues: ValidationIssueDraft[],
): void {
  const byType = new Map(limits.map((item) => [item.elementType, item]));

  for (const cluster of creatives) {
    for (const ad of cluster.ads) {
      clipField(
        cluster.cluster_name,
        ad.ab_group,
        "headline1",
        ad.headline1,
        byType.get("headline1"),
        (value) => {
          ad.headline1 = value;
        },
        issues,
      );
      clipField(
        cluster.cluster_name,
        ad.ab_group,
        "headline2",
        ad.headline2,
        byType.get("headline2"),
        (value) => {
          ad.headline2 = value;
        },
        issues,
      );
      clipField(
        cluster.cluster_name,
        ad.ab_group,
        "description",
        ad.description,
        byType.get("description"),
        (value) => {
          ad.description = value;
        },
        issues,
      );

      const sitelinkLimit = byType.get("sitelink");
      if (sitelinkLimit && ad.sitelinks.length > sitelinkLimit.maxCount) {
        issues.push({
          clusterName: cluster.cluster_name,
          abGroup: ad.ab_group,
          elementType: "sitelink",
          level: "warning",
          code: "count_limit",
          message: `Sitelinks truncated to ${sitelinkLimit.maxCount}`,
          autoFixed: true,
        });
        ad.sitelinks = ad.sitelinks.slice(0, sitelinkLimit.maxCount);
      }
      ad.sitelinks = ad.sitelinks.map((item, index) => {
        if (sitelinkLimit && item.length > sitelinkLimit.maxLength) {
          issues.push({
            clusterName: cluster.cluster_name,
            abGroup: ad.ab_group,
            elementType: "sitelink",
            text: item,
            level: "warning",
            code: "length_limit",
            message: `Sitelink ${index + 1} clipped to ${sitelinkLimit.maxLength}`,
            autoFixed: true,
            fixedText: item.slice(0, sitelinkLimit.maxLength),
          });
          return item.slice(0, sitelinkLimit.maxLength);
        }
        return item;
      });

      const calloutLimit = byType.get("callout");
      if (calloutLimit && ad.callouts.length > calloutLimit.maxCount) {
        issues.push({
          clusterName: cluster.cluster_name,
          abGroup: ad.ab_group,
          elementType: "callout",
          level: "warning",
          code: "count_limit",
          message: `Callouts truncated to ${calloutLimit.maxCount}`,
          autoFixed: true,
        });
        ad.callouts = ad.callouts.slice(0, calloutLimit.maxCount);
      }
      ad.callouts = ad.callouts.map((item) => {
        if (calloutLimit && item.length > calloutLimit.maxLength) {
          issues.push({
            clusterName: cluster.cluster_name,
            abGroup: ad.ab_group,
            elementType: "callout",
            text: item,
            level: "warning",
            code: "length_limit",
            message: `Callout clipped to ${calloutLimit.maxLength}`,
            autoFixed: true,
            fixedText: item.slice(0, calloutLimit.maxLength),
          });
          return item.slice(0, calloutLimit.maxLength);
        }
        return item;
      });
    }
  }
}

function clipField(
  clusterName: string,
  abGroup: string,
  elementType: string,
  text: string,
  limit: { maxLength: number } | undefined,
  assign: (value: string) => void,
  issues: ValidationIssueDraft[],
): void {
  if (!limit || text.length <= limit.maxLength) {
    return;
  }
  const fixed = text.slice(0, limit.maxLength);
  assign(fixed);
  issues.push({
    clusterName,
    abGroup,
    elementType,
    text,
    level: "warning",
    code: "length_limit",
    message: `${elementType} clipped to ${limit.maxLength} chars`,
    autoFixed: true,
    fixedText: fixed,
  });
}

function applyForbiddenChecks(
  creatives: ClusterCreatives[],
  forbidden: string[],
  issues: ValidationIssueDraft[],
): void {
  for (const cluster of creatives) {
    for (const ad of cluster.ads) {
      for (const [elementType, text] of textsOf(ad)) {
        const hit = containsForbidden(text, forbidden);
        if (hit) {
          issues.push({
            clusterName: cluster.cluster_name,
            abGroup: ad.ab_group,
            elementType,
            text,
            level: "critical",
            code: "forbidden_phrase",
            message: `Forbidden phrase "${hit}" in ${elementType}`,
            autoFixed: false,
          });
        }
      }
    }
  }
}

function applyRiskyPhraseChecks(
  creatives: ClusterCreatives[],
  issues: ValidationIssueDraft[],
): void {
  for (const cluster of creatives) {
    for (const ad of cluster.ads) {
      for (const [elementType, text] of textsOf(ad)) {
        if (RISKY_PHRASES.some((phrase) => normalize(text).includes(phrase))) {
          issues.push({
            clusterName: cluster.cluster_name,
            abGroup: ad.ab_group,
            elementType,
            text,
            level: "warning",
            code: "risky_claim",
            message: `Possible unsubstantiated claim in ${elementType}`,
            autoFixed: false,
          });
        }
      }
    }
  }
}

function applyDedupChecks(
  creatives: ClusterCreatives[],
  issues: ValidationIssueDraft[],
): void {
  const seen = new Map<string, string>();
  for (const cluster of creatives) {
    for (const ad of cluster.ads) {
      const key = `${ad.headline1}|${ad.description}`.toLowerCase();
      const prev = seen.get(key);
      if (prev) {
        issues.push({
          clusterName: cluster.cluster_name,
          abGroup: ad.ab_group,
          level: "warning",
          code: "duplicate_ad",
          message: `Duplicate ad already used in "${prev}"`,
          autoFixed: false,
        });
      } else {
        seen.set(key, cluster.cluster_name);
      }
    }
  }
}

function applyKeywordDedup(
  core: SemanticCore,
  issues: ValidationIssueDraft[],
): void {
  const seen = new Map<string, string>();
  for (const cluster of core.clusters) {
    for (const kw of cluster.keywords) {
      const key = kw.phrase.toLowerCase();
      const prev = seen.get(key);
      if (prev && prev !== cluster.cluster_name) {
        issues.push({
          clusterName: cluster.cluster_name,
          level: "warning",
          code: "duplicate_keyword",
          message: `Keyword "${kw.phrase}" also in "${prev}"`,
          autoFixed: false,
        });
      } else {
        seen.set(key, cluster.cluster_name);
      }
    }
  }
}

function applyUspChecks(
  creatives: ClusterCreatives[],
  usp: string[],
  issues: ValidationIssueDraft[],
): void {
  if (usp.length === 0) return;
  for (const cluster of creatives) {
    for (const ad of cluster.ads) {
      const blob = `${ad.headline1} ${ad.headline2} ${ad.description}`.toLowerCase();
      const ok = usp.some((item) =>
        blob.includes(item.toLowerCase().slice(0, Math.min(12, item.length))),
      );
      if (!ok) {
        issues.push({
          clusterName: cluster.cluster_name,
          abGroup: ad.ab_group,
          level: "warning",
          code: "missing_usp",
          message: "Ad does not visibly use a brief USP",
          autoFixed: false,
        });
      }
    }
  }
}

function applyGeoLanguageChecks(
  creatives: ClusterCreatives[],
  geo: string[] | undefined,
  issues: ValidationIssueDraft[],
): void {
  if (!geo?.some((code) => /^(RU|KZ|BY|UA)/i.test(code))) {
    return;
  }
  const cyrillic = /[а-яё]/i;
  for (const cluster of creatives) {
    for (const ad of cluster.ads) {
      const blob = `${ad.headline1} ${ad.description}`;
      if (!cyrillic.test(blob)) {
        issues.push({
          clusterName: cluster.cluster_name,
          abGroup: ad.ab_group,
          elementType: "headline1",
          level: "warning",
          code: "geo_language",
          message: "Copy has no Cyrillic while geo targets RU/CIS",
          autoFixed: false,
        });
      }
    }
  }
}

function applyCrossClusterKeywordCheck(
  core: SemanticCore,
  issues: ValidationIssueDraft[],
): void {
  for (const cluster of core.clusters) {
    for (const other of core.clusters) {
      if (other.cluster_name === cluster.cluster_name) continue;
      const otherPositives = new Set(
        other.keywords.map((item) => item.phrase.toLowerCase()),
      );
      const otherNegatives = new Set(
        other.negative_keywords.map((item) => item.toLowerCase()),
      );
      for (const kw of cluster.keywords) {
        const phrase = kw.phrase.toLowerCase();
        if (otherPositives.has(phrase)) continue;
        if (otherNegatives.has(phrase)) continue;
        issues.push({
          clusterName: other.cluster_name,
          level: "warning",
          code: "cross_minus_gap",
          message: `Missing minus "${kw.phrase}" from "${cluster.cluster_name}"`,
          autoFixed: false,
        });
      }
    }
  }
}

function textsOf(ad: ClusterCreatives["ads"][number]): Array<[string, string]> {
  return [
    ["headline1", ad.headline1],
    ["headline2", ad.headline2],
    ["description", ad.description],
    ...ad.sitelinks.map((item, i) => [`sitelink:${i}`, item] as [string, string]),
    ...ad.callouts.map((item, i) => [`callout:${i}`, item] as [string, string]),
  ];
}
