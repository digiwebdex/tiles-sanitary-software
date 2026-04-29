import fs from 'fs';
import path from 'path';
import { config as loadDotenv, parse as parseDotenv } from 'dotenv';

const buildDatabaseUrl = (password: string) => {
  const encodedPassword = encodeURIComponent(password);
  return `postgres://tileserp:${encodedPassword}@127.0.0.1:5440/tileserp`;
};

const isUsableSecret = (value?: string) => Boolean(
  value &&
  value.trim() &&
  !value.includes('GENERATE_') &&
  !value.includes('CHANGE_ME') &&
  value !== 'changeme_strong_password'
);

export function loadBackendEnv() {
  const rootEnvPaths = Array.from(new Set([
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../../.env'),
  ]));
  const localEnvPaths = Array.from(new Set([
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
  ]));

  const rootEnv = rootEnvPaths
    .find((envPath) => fs.existsSync(envPath));
  const parsedRootEnv = rootEnv ? parseDotenv(fs.readFileSync(rootEnv)) : {};
  const isProduction = process.env.NODE_ENV === 'production' || parsedRootEnv.NODE_ENV === 'production';

  const envPaths = isProduction ? rootEnvPaths : [...rootEnvPaths, ...localEnvPaths];
  const existingEnvs = envPaths
    .filter((envPath) => fs.existsSync(envPath))
    .map((envPath) => ({
      path: envPath,
      parsed: parseDotenv(fs.readFileSync(envPath)),
    }));

  for (const [index, envFile] of existingEnvs.entries()) {
    loadDotenv({ path: envFile.path, override: index === 0 });
  }

  const databaseSources = isProduction ? [{ parsed: parsedRootEnv }, ...existingEnvs] : existingEnvs;
  const passwordEnv = databaseSources.find(({ parsed }) => isUsableSecret(parsed.DB_PASSWORD))?.parsed;
  const urlEnv = databaseSources.find(({ parsed }) => isUsableSecret(parsed.DATABASE_URL))?.parsed;

  if (passwordEnv?.DB_PASSWORD) {
    process.env.DATABASE_URL = buildDatabaseUrl(passwordEnv.DB_PASSWORD);
  } else if (urlEnv?.DATABASE_URL) {
    process.env.DATABASE_URL = urlEnv.DATABASE_URL;
  }
}