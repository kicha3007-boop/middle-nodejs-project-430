// Общие помощники тестов: приложение целиком поверх реальной базы и подменного каталога статики.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect } from 'vitest';

import { buildApp } from '../src/app.ts';
import { createPool, type Pool } from '../src/db/pool.ts';
import type { BookingDto, FlightDto } from '../src/presenter.ts';

export const CONTACT = { email: 'ivan@example.com', phone: '+79991234567' };

// Каталог статики создаётся во временной папке: тесты не зависят от того, выполнялся ли make build.
// Рядом с ним лежит secret.txt — выход вверх по директориям не должен его отдавать.
const createPublicDir = (): string => {
  const base = mkdtempSync(path.join(tmpdir(), 'flight-booking-'));
  const root = path.join(base, 'public');
  mkdirSync(path.join(root, 'assets'), { recursive: true });
  writeFileSync(path.join(root, 'index.html'), "<!doctype html><div id='root'></div>");
  writeFileSync(path.join(root, 'assets', 'app.js'), "console.log('asset');");
  writeFileSync(path.join(base, 'secret.txt'), 'secret');
  return root;
};

// Регистрирует в файле тестов хуки, которые поднимают и гасят приложение.
export const useApp = (): { app: () => FastifyInstance } => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL ?? '');
    app = buildApp({ pool, publicDir: createPublicDir() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  return { app: () => app };
};

export const isoDate = (daysFromToday: number): string => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
};

export const passenger = (lastName = 'Петров', overrides: Record<string, string> = {}) => ({
  firstName: 'Иван',
  lastName,
  dateOfBirth: '1990-05-20',
  documentNumber: '4509 123456',
  ...overrides,
});

export const findFlight = async (app: FastifyInstance): Promise<FlightDto> => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/flights',
    query: { origin: 'MOW', destination: 'LED', date: isoDate(3) },
  });
  expect(response.statusCode).toBe(200);
  const flights = response.json<FlightDto[]>();
  expect(flights.length).toBeGreaterThan(0);
  return flights[0];
};

export const createBooking = async (
  app: FastifyInstance,
  flight: FlightDto,
  passengers = [passenger()],
): Promise<BookingDto> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    payload: { flightId: flight.id, contact: CONTACT, passengers },
  });
  expect(response.statusCode).toBe(201);
  return response.json<BookingDto>();
};
