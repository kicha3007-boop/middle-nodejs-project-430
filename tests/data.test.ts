// Миграции и справочные данные: правила генерации и повторяемость загрузки.
import { describe, expect, test } from 'vitest';

import { migrate } from '../src/db/migrate.ts';
import { createPool } from '../src/db/pool.ts';
import { CITIES, DAYS_AHEAD, generateFlights, isoDay, seed, utcToday } from '../src/db/seed.ts';

describe('seed data', () => {
  test('generated flights follow data rules', () => {
    const start = utcToday();
    const flights = generateFlights(start);
    const perDay = new Map<string, number>();
    for (const flight of flights) {
      expect(flight.originCode).not.toBe(flight.destinationCode);
      expect(flight.durationMinutes).toBeGreaterThanOrEqual(80);
      expect(flight.durationMinutes).toBeLessThanOrEqual(280);
      expect(flight.priceAmount).toBeGreaterThanOrEqual(3000);
      expect(flight.priceAmount).toBeLessThanOrEqual(8500);
      expect(flight.seatsAvailable).toBeGreaterThanOrEqual(10);
      expect(flight.seatsAvailable).toBeLessThanOrEqual(90);
      expect(flight.arrivalAt.getTime() - flight.departureAt.getTime()).toBe(
        flight.durationMinutes * 60_000,
      );
      expect(flight.flightNumber.startsWith(flight.airlineCode)).toBe(true);
      const key = `${flight.originCode}-${flight.destinationCode}-${isoDay(flight.departureAt)}`;
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    expect(perDay.size).toBe(CITIES.length * (CITIES.length - 1) * DAYS_AHEAD);
    for (const count of perDay.values()) {
      expect([2, 3]).toContain(count);
    }
    const firstDay = flights.map((f) => isoDay(f.departureAt)).sort()[0];
    expect(firstDay).toBe(isoDay(start));
  });

  test('generation is deterministic', () => {
    const start = utcToday();
    expect(generateFlights(start, 2)).toEqual(generateFlights(start, 2));
  });

  test('migrate and seed are repeatable', async () => {
    const pool = createPool(process.env.DATABASE_URL ?? '');
    try {
      const count = async () =>
        Number((await pool.query('SELECT count(*) AS n FROM flights')).rows[0].n);
      const before = await count();
      expect(await migrate(pool)).toEqual([]);
      await seed(pool);
      expect(await count()).toBe(before);
      const cities = await pool.query('SELECT count(*) AS n FROM cities');
      expect(Number(cities.rows[0].n)).toBe(CITIES.length);
    } finally {
      await pool.end();
    }
  });
});
