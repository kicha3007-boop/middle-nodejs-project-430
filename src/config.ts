import path from 'node:path';

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
export const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'migrations');

export const databaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Не задана переменная окружения DATABASE_URL');
  }
  return url;
};

export const port = (): number => Number(process.env.PORT ?? 8080);
