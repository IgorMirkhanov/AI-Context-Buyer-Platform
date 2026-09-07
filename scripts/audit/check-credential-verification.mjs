import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const projectId = process.argv[2] ?? '98abacc8-8c51-4881-aa24-5c6b66907847';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
const { rows } = await client.query(
  `SELECT project_id, platform, external_account_id, api_verified_at, api_verification_error, created_at, expires_at
   FROM ad_platform_credentials
   WHERE project_id = $1`,
  [projectId],
);
console.log(JSON.stringify(rows, null, 2));
await client.end();
