// Готовит базу из DATABASE_URL: миграции и справочные данные.
import { migrate } from '../src/db/migrate.ts';
import { createPool } from '../src/db/pool.ts';
import { seed } from '../src/db/seed.ts';

export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Для тестов нужна PostgreSQL: задайте DATABASE_URL (см. README)');
  }
  const pool = createPool(url);
  try {
    await migrate(pool);
    await seed(pool);
  } finally {
    await pool.end();
  }
}
