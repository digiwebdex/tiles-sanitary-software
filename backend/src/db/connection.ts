import knex from 'knex';
import config from './knexfile';

export const db = knex(config);

export async function checkDbConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err);
    return false;
  }
}
