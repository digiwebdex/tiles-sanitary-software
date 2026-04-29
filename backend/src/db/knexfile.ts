import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { Knex } from 'knex';

// Prefer project-root .env over backend/.env so PM2/Knex never pick up stale
// local DB credentials after a VPS deploy.
for (const envPath of Array.from(new Set([
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
]))) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
}

// Detect runtime: when running compiled JS from /app/dist, __filename ends with .js
// In that case we must point knex at the compiled .js migration files, not the .ts sources.
const isCompiled = __filename.endsWith('.js');
const extension = isCompiled ? 'js' : 'ts';
const migrationsDir = path.resolve(__dirname, 'migrations');
const seedsDir = path.resolve(__dirname, 'seeds');

const config: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: migrationsDir,
    tableName: 'knex_migrations',
    extension,
    loadExtensions: [`.${extension}`],
  },
  seeds: {
    directory: seedsDir,
    extension,
    loadExtensions: [`.${extension}`],
  },
};

export default config;
