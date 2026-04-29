import fs from 'fs';
import path from 'path';
import { config as loadDotenv, parse as parseDotenv } from 'dotenv';

const buildDatabaseUrl = (password: string) => {
  const encodedPassword = encodeURIComponent(password);
  return `postgres://tileserp:${encodedPassword}@127.0.0.1:5440/tileserp`;
};

export function loadBackendEnv() {
  const envPaths = Array.from(new Set([
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
  ]));

  const existingEnvPaths = envPaths.filter((envPath) => fs.existsSync(envPath));
  const primaryEnvPath = existingEnvPaths[0];
  const primaryEnv = primaryEnvPath ? parseDotenv(fs.readFileSync(primaryEnvPath)) : {};

  for (const [index, envPath] of existingEnvPaths.entries()) {
    loadDotenv({ path: envPath, override: index === 0 });
  }

  if (primaryEnv.DATABASE_URL) {
    process.env.DATABASE_URL = primaryEnv.DATABASE_URL;
  } else if (primaryEnv.DB_PASSWORD) {
    process.env.DATABASE_URL = buildDatabaseUrl(primaryEnv.DB_PASSWORD);
  }
}