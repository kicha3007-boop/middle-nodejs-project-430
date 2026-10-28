// Консольные команды: node src/cli.ts migrate | seed | prepare.
import { databaseUrl } from './config.ts';
import { migrate } from './db/migrate.ts';
import { createPool } from './db/pool.ts';
import { seed } from './db/seed.ts';

const command = process.argv[2];
const COMMANDS = new Set(['migrate', 'seed', 'prepare']);

if (!command || !COMMANDS.has(command)) {
  console.error('Использование: node src/cli.ts migrate|seed|prepare');
  process.exit(2);
}

const pool = createPool(databaseUrl());
try {
  if (command === 'migrate' || command === 'prepare') {
    const applied = await migrate(pool);
    console.log(`Миграции применены: ${applied.length > 0 ? applied.join(', ') : 'новых нет'}`);
  }
  if (command === 'seed' || command === 'prepare') {
    const count = await seed(pool);
    console.log(`Справочные данные загружены, рейсов в окне: ${count}`);
  }
} finally {
  await pool.end();
}
