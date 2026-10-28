import pg from 'pg';

// Столбец date драйвер по умолчанию превращает в Date с полуночью по поясу процесса, и дата
// рождения восточнее Гринвича уезжает на сутки назад. Оставляем её строкой YYYY-MM-DD.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

export type Pool = pg.Pool;
export type Client = pg.PoolClient;

export const createPool = (connectionString: string): pg.Pool =>
  new pg.Pool({
    connectionString,
    max: 10,
    // Пояс сессии — явно UTC: по умолчанию он берётся с сервера базы и разный на разных машинах.
    options: '-c TimeZone=UTC',
  });

// Транзакция на отдельном соединении: COMMIT при успехе, ROLLBACK при исключении,
// и соединение возвращается в пул на любом пути.
export const withTransaction = async <T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
