import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { MockKeywordIdeasProvider } from '@context-buyer/connectors';
import {
  compareCommercialGoldRecall,
  compareSemanticQa,
  runSemanticPipeline,
  type SemanticQaFixture,
} from '@context-buyer/agents';

function repoRoot(): string {
  return path.resolve(__dirname, '../../../..');
}

function loadFixtures(): SemanticQaFixture[] {
  const dir = path.join(repoRoot(), 'qa/semantic/fixtures');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const raw = readFileSync(path.join(dir, name), 'utf8');
      return JSON.parse(raw) as SemanticQaFixture;
    });
}

/** Baseline из docs/12_SEMANTIC_QA_BASELINE.md — фильтр «коммерческие» не должен ухудшать recall. */
const FIXTURE_RECALL_BASELINE: Record<string, { recall: number; commercialRecall: number }> = {
  'asus-gaming': { recall: 1, commercialRecall: 1 },
  'asus-hp-brands': { recall: 1, commercialRecall: 1 },
  'office-laptops': { recall: 1, commercialRecall: 1 },
  'orthodontics-clinic': { recall: 14 / 18, commercialRecall: 8 / 12 },
  'accounting-b2b': { recall: 14 / 18, commercialRecall: 8 / 12 },
};

/** Разумный потолок ключей на «реальных» фикстурах (baseline ~14–21, не 54–81). */
const REAL_FIXTURE_AGENT_KEY_LIMIT: Record<string, number> = {
  'orthodontics-clinic': 28,
  'accounting-b2b': 32,
};

function hasConsecutiveDuplicateTokens(phrase: string): boolean {
  const tokens = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === tokens[i - 1]) {
      return true;
    }
  }
  return false;
}

describe('semantic QA fixtures — commercial gold recall', () => {
  const ideas = new MockKeywordIdeasProvider();
  const fixtures = loadFixtures();

  it.each(fixtures.map((fixture) => [fixture.id, fixture] as const))(
    '%s keeps baseline full and commercial gold recall',
    async (id, fixture) => {
      const baseline = FIXTURE_RECALL_BASELINE[id];
      expect(baseline).toBeDefined();

      const { core } = await runSemanticPipeline(fixture.brief, {
        getKeywordIdeas: (seeds, geo) => ideas.getKeywordIdeas(seeds, geo),
      });
      const phrases = core.clusters.flatMap((cluster) =>
        cluster.keywords.map((item) => item.phrase),
      );
      const agent = {
        phrases,
        clusters: core.clusters.map((cluster) => ({
          name: cluster.cluster_name,
          phrases: cluster.keywords.map((item) => item.phrase),
        })),
        global_negatives: core.global_negatives,
      };
      const coverage = compareSemanticQa(fixture, agent);
      const commercial = compareCommercialGoldRecall(fixture, agent);

      expect(coverage.recall).toBe(baseline.recall);
      expect(commercial.commercialRecall).toBe(baseline.commercialRecall);

      for (const phrase of phrases) {
        expect(hasConsecutiveDuplicateTokens(phrase)).toBe(false);
      }
      const keyLimit = REAL_FIXTURE_AGENT_KEY_LIMIT[id];
      if (keyLimit != null) {
        expect(phrases.length).toBeLessThanOrEqual(keyLimit);
      }
    },
  );
});
