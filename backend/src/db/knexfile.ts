import path from 'path';
import dotenv from 'dotenv';
import type { Knex } from 'knex';

// Knex CLI changes CWD to this folder, so .env in backend/ is not auto-loaded.
// Load it explicitly from the backend project root (../../.env relative to this file).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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
