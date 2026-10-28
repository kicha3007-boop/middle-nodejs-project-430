// Точка входа: поднимает приложение на 0.0.0.0 и порту из PORT (по умолчанию 8080).
// Миграции и загрузку данных до старта выполняет `node src/cli.ts prepare` в make start.
import { buildApp } from './app.ts';
import { databaseUrl, port } from './config.ts';
import { createPool } from './db/pool.ts';

const pool = createPool(databaseUrl());
const app = buildApp({ pool, logger: true });
app.addHook('onClose', async () => {
  await pool.end();
});

const shutdown = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ host: '0.0.0.0', port: port() });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
