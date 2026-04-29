import path from 'path';
import type { Knex } from 'knex';
import { loadBackendEnv } from '../config/loadEnv';

loadBackendEnv();

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
