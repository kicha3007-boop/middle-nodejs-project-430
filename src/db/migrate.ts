// Применение SQL-миграций из migrations/.
// Порядок задаёт числовой префикс имени файла (0001_..., 0002_...), а не порядок файлов в каталоге.
// Применённые миграции учитываются в schema_migrations: повторный запуск ничего не делает
// и ничего не удаляет.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { MIGRATIONS_DIR } from '../config.ts';
import { type Pool, withTransaction } from './pool.ts';

const MIGRATION_NAME = /^(\d+)_[a-z0-9_]+\.sql$/;
// Ключ advisory-блокировки: два одновременных запуска не применят миграцию дважды.
const LOCK_KEY = 430_001;

interface Migration {
  version: number;
  file: string;
}

export const discoverMigrations = async (dir = MIGRATIONS_DIR): Promise<Migration[]> => {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql'));
  const migrations = files.map((file) => {
    const match = MIGRATION_NAME.exec(file);
    if (!match) {
      throw new Error(`Имя миграции не по шаблону NNNN_name.sql: ${file}`);
    }
    return { version: Number(match[1]), file };
  });
  migrations.sort((a, b) => a.version - b.version);
  const versions = new Set(migrations.map((m) => m.version));
  if (versions.size !== migrations.length) {
    throw new Error('Номера миграций повторяются');
  }
  return migrations;
};

export const migrate = async (pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> => {
  const migrations = await discoverMigrations(dir);
  return withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    );
    const applied = new Set(rows.map((row) => row.version));
    const appliedNow: string[] = [];
    for (const { version, file } of migrations) {
      if (applied.has(version)) {
        continue;
      }
      await client.query(await readFile(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
        version,
        file,
      ]);
      appliedNow.push(file);
    }
    return appliedNow;
  });
};
