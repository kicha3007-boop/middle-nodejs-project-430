// Справочник городов, поиск рейсов и рейс по идентификатору.
import { describe, expect, test } from 'vitest';

import type { FlightDto } from '../src/presenter.ts';
import { findFlight, isoDate, useApp } from './helpers.ts';

const { app } = useApp();
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const search = (query: Record<string, string>) =>
  app().inject({ method: 'GET', url: '/api/flights', query });

describe('cities', () => {
  test('seven cities, Moscow and Saint Petersburg first', async () => {
    const response = await app().inject({ method: 'GET', url: '/api/cities' });
    expect(response.statusCode).toBe(200);
    const cities = response.json<{ code: string; name: string }[]>();
    expect(cities.map((city) => city.code)).toEqual([
      'MOW',
      'LED',
      'AER',
      'KZN',
      'SVX',
      'OVB',
      'KGD',
    ]);
    expect(cities[0]).toEqual({ code: 'MOW', name: 'Москва', country: 'Россия' });
    expect(cities[1].name).toBe('Санкт-Петербург');
  });
});

describe('flight search', () => {
  test('returns flights in contract format', async () => {
    const date = isoDate(2);
    const response = await search({ origin: 'MOW', destination: 'LED', date, passengers: '2' });
    expect(response.statusCode).toBe(200);
    const flights = response.json<FlightDto[]>();
    expect(flights.length).toBeGreaterThanOrEqual(2);
    expect(flights.length).toBeLessThanOrEqual(3);
    for (const flight of flights) {
      expect(flight.origin.code).toBe('MOW');
      expect(flight.destination).toEqual({
        code: 'LED',
        name: 'Санкт-Петербург',
        country: 'Россия',
      });
      expect(flight.departureAt.startsWith(date)).toBe(true);
      expect(flight.departureAt).toMatch(ISO_UTC);
      expect(flight.arrivalAt).toMatch(ISO_UTC);
      expect(typeof flight.price.amount).toBe('number');
      expect(flight.price.currency).toBe('RUB');
      expect(flight.price.amount).toBeGreaterThanOrEqual(3000);
      expect(flight.price.amount).toBeLessThanOrEqual(8500);
      expect(flight.durationMinutes).toBeGreaterThanOrEqual(80);
      expect(flight.durationMinutes).toBeLessThanOrEqual(280);
      expect(flight.seatsAvailable).toBeGreaterThanOrEqual(2);
      expect(flight.flightNumber).toMatch(/^[A-Z0-9]{2}\d+$/);
      expect(['SU', 'DP', 'S7', 'U6']).toContain(flight.airline.code);
    }
  });

  test('has flights for today', async () => {
    const response = await search({ origin: 'MOW', destination: 'LED', date: isoDate(0) });
    expect(response.statusCode).toBe(200);
    expect(response.json<FlightDto[]>().length).toBeGreaterThan(0);
  });

  test('filters by free seats', async () => {
    const response = await search({
      origin: 'MOW',
      destination: 'LED',
      date: isoDate(3),
      passengers: '91',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  test('same city returns empty list', async () => {
    const response = await search({ origin: 'MOW', destination: 'MOW', date: isoDate(3) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  test('date outside data window returns empty list', async () => {
    const response = await search({ origin: 'MOW', destination: 'LED', date: isoDate(60) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  test('missing date is validation error', async () => {
    const response = await search({ origin: 'MOW', destination: 'LED' });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ code: string; message: string }>();
    expect(body.code).toBe('validation_error');
    expect(body.message).toContain('date');
  });

  test.each<Record<string, string>>([
    { origin: 'MOW', destination: 'LED', date: 'завтра' },
    { origin: 'MOW', destination: 'LED', date: isoDate(1), passengers: 'два' },
    { origin: 'MOW', destination: 'LED', date: isoDate(1), passengers: '0' },
    { origin: '', destination: 'LED', date: isoDate(1) },
  ])('malformed params %o are validation error', async (query) => {
    const response = await search(query);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
  });
});

describe('flight by id', () => {
  test('matches search result', async () => {
    const flight = await findFlight(app());
    const response = await app().inject({ method: 'GET', url: `/api/flights/${flight.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(flight);
  });

  test('unknown id is not found', async () => {
    const response = await app().inject({ method: 'GET', url: '/api/flights/NOPE' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'not_found' });
  });
});
