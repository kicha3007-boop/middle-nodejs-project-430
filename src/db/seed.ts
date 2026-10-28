// Загрузка справочных данных: города, авиакомпании и рейсы на 30 дней от текущей даты.
// Загрузка повторяемая: справочники обновляются по ключу, у рейса детерминированный id
// (пара городов, дата, порядковый номер), поэтому повторный запуск не создаёт дублей
// и только дозаполняет окно, когда наступил новый день.
import { type Pool, withTransaction } from './pool.ts';

export const CITIES = [
  { code: 'MOW', name: 'Москва', country: 'Россия' },
  { code: 'LED', name: 'Санкт-Петербург', country: 'Россия' },
  { code: 'AER', name: 'Сочи', country: 'Россия' },
  { code: 'KZN', name: 'Казань', country: 'Россия' },
  { code: 'SVX', name: 'Екатеринбург', country: 'Россия' },
  { code: 'OVB', name: 'Новосибирск', country: 'Россия' },
  { code: 'KGD', name: 'Калининград', country: 'Россия' },
];

export const AIRLINES = [
  { code: 'SU', name: 'Аэрофлот' },
  { code: 'DP', name: 'Победа' },
  { code: 'S7', name: 'S7 Airlines' },
  { code: 'U6', name: 'Уральские авиалинии' },
];

export const DAYS_AHEAD = 30;
// Первый вылет дня — не раньше 05:00 UTC, последний — не позже 20:00 UTC.
const FIRST_DEPARTURE_MINUTE = 5 * 60;
const LAST_DEPARTURE_MINUTE = 20 * 60;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface FlightSeed {
  id: string;
  flightNumber: string;
  airlineCode: string;
  originCode: string;
  destinationCode: string;
  departureAt: Date;
  arrivalAt: Date;
  durationMinutes: number;
  priceAmount: number;
  seatsAvailable: number;
}

// Генератор псевдослучайных чисел с зерном из строки (FNV-1a + mulberry32):
// одинаковые входные данные всегда дают одинаковые рейсы.
const seededRandom = (seed: string): (() => number) => {
  let state = 2166136261;
  for (const char of seed) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Целое из [min, max] с шагом step.
const randomInt = (random: () => number, min: number, max: number, step = 1): number =>
  min + Math.floor(random() * (Math.floor((max - min) / step) + 1)) * step;

export const isoDay = (day: Date): string => day.toISOString().slice(0, 10);

export const utcToday = (): Date => new Date(`${isoDay(new Date())}T00:00:00Z`);

export const flightsForDay = (origin: string, destination: string, day: Date): FlightSeed[] => {
  const dayKey = isoDay(day);
  const random = seededRandom(`${origin}-${destination}-${dayKey}`);
  // Длительность зависит только от направления: в течение дня у маршрута она одна.
  const baseDuration = randomInt(seededRandom(`${origin}-${destination}`), 80, 260);
  const count = randomInt(random, 2, 3);
  const window = Math.floor((LAST_DEPARTURE_MINUTE - FIRST_DEPARTURE_MINUTE) / count);

  return Array.from({ length: count }, (_, index) => {
    const minute = FIRST_DEPARTURE_MINUTE + index * window + randomInt(random, 0, window - 30, 5);
    const departureAt = new Date(day.getTime() + minute * MINUTE_MS);
    const durationMinutes = baseDuration + randomInt(random, 0, 20, 5);
    const airline = AIRLINES[randomInt(random, 0, AIRLINES.length - 1)];
    return {
      id: `${origin}${destination}-${dayKey.replaceAll('-', '')}-${index + 1}`,
      flightNumber: `${airline.code}${randomInt(random, 100, 9999)}`,
      airlineCode: airline.code,
      originCode: origin,
      destinationCode: destination,
      departureAt,
      arrivalAt: new Date(departureAt.getTime() + durationMinutes * MINUTE_MS),
      durationMinutes,
      priceAmount: randomInt(random, 3000, 8500, 100),
      seatsAvailable: randomInt(random, 10, 90),
    };
  });
};

export const generateFlights = (start: Date, days = DAYS_AHEAD): FlightSeed[] => {
  const flights: FlightSeed[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start.getTime() + offset * DAY_MS);
    for (const origin of CITIES) {
      for (const destination of CITIES) {
        if (origin.code !== destination.code) {
          flights.push(...flightsForDay(origin.code, destination.code, day));
        }
      }
    }
  }
  return flights;
};

const INSERT_BATCH = 500;

export const seed = async (pool: Pool, start = utcToday()): Promise<number> => {
  const flights = generateFlights(start);
  await withTransaction(pool, async (client) => {
    for (const [position, city] of CITIES.entries()) {
      await client.query(
        `INSERT INTO cities (code, name, country, position) VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, country = EXCLUDED.country, position = EXCLUDED.position`,
        [city.code, city.name, city.country, position],
      );
    }
    for (const airline of AIRLINES) {
      await client.query(
        `INSERT INTO airlines (code, name) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
        [airline.code, airline.name],
      );
    }
    // Рейсы вставляются пачками через unnest: один запрос на пачку, значения — параметрами.
    for (let i = 0; i < flights.length; i += INSERT_BATCH) {
      const batch = flights.slice(i, i + INSERT_BATCH);
      await client.query(
        `INSERT INTO flights (
           id, flight_number, airline_code, origin_code, destination_code,
           departure_at, arrival_at, duration_minutes, price_amount, currency, seats_available
         )
         SELECT id, flight_number, airline_code, origin_code, destination_code,
                departure_at, arrival_at, duration_minutes, price_amount, 'RUB', seats_available
         FROM unnest(
           $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
           $6::timestamptz[], $7::timestamptz[], $8::int[], $9::int[], $10::int[]
         ) AS t(id, flight_number, airline_code, origin_code, destination_code,
                departure_at, arrival_at, duration_minutes, price_amount, seats_available)
         ON CONFLICT (id) DO NOTHING`,
        [
          batch.map((f) => f.id),
          batch.map((f) => f.flightNumber),
          batch.map((f) => f.airlineCode),
          batch.map((f) => f.originCode),
          batch.map((f) => f.destinationCode),
          batch.map((f) => f.departureAt),
          batch.map((f) => f.arrivalAt),
          batch.map((f) => f.durationMinutes),
          batch.map((f) => f.priceAmount),
          batch.map((f) => f.seatsAvailable),
        ],
      );
    }
  });
  return flights.length;
};
