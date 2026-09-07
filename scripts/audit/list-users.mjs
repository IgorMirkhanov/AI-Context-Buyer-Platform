import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `SELECT email, organization_id FROM users ORDER BY created_at LIMIT 5`,
);
console.log(rows);
await client.end();
