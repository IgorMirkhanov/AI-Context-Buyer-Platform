import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const pid = 'e16a7984-47a9-41dd-a34e-b6f21da14b76';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const analysis = await client.query(
  `SELECT website_url, left(landing_text, 2500) AS landing_preview,
          length(landing_text) AS landing_len, custom_seeds,
          created_at, updated_at
   FROM project_analyses WHERE project_id = $1`,
  [pid],
);

const clusters = await client.query(
  `SELECT c.name, count(k.id)::int AS kw
   FROM semantic_clusters c
   LEFT JOIN semantic_keywords k ON k.cluster_id = c.id
   WHERE c.project_id = $1
   GROUP BY c.id, c.name
   ORDER BY c.name`,
  [pid],
);

const junk = await client.query(
  `SELECT phrase, source
   FROM semantic_keywords
   WHERE project_id = $1
     AND (phrase ILIKE '%цветн%' OR phrase ILIKE '%текстур%'
       OR phrase ILIKE '%глянц%' OR phrase ILIKE '%пластик%'
       OR phrase ILIKE '%элемент%' OR phrase ILIKE '%салон%')
   ORDER BY phrase
   LIMIT 50`,
  [pid],
);

const landing = analysis.rows[0]?.landing_preview ?? '';
const tokens = String(landing)
  .split(/[\s,.;:]+/)
  .filter((t) => t.length > 5)
  .slice(0, 40);

console.log(
  JSON.stringify(
    {
      analysis: analysis.rows,
      clusterCount: clusters.rows.length,
      suspiciousClusters: clusters.rows.filter((c) =>
        /цветн|текстур|глянц|пластик|элемент|салон/i.test(c.name),
      ),
      allClustersSample: clusters.rows.slice(0, 30),
      junkKeywords: junk.rows,
      landingTokensLenGt5: tokens,
    },
    null,
    2,
  ),
);

await client.end();
