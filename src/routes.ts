// Маршруты API. Обработчики тонкие: берут разобранный запрос, зовут сценарий из services.ts
// и отдают результат. HEAD к GET-маршрутам Fastify добавляет сам (exposeHeadRoutes).
import type { FastifyInstance } from 'fastify';

import type { Pool } from './db/pool.ts';
import { createBookingSchema, searchFlightsSchema } from './schemas.ts';
import * as services from './services.ts';
import type { CreateBookingInput } from './services.ts';

interface SearchQuery {
  origin: string;
  destination: string;
  date: string;
  passengers: number;
}

export const registerApiRoutes = (app: FastifyInstance, pool: Pool): void => {
  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/cities', async () => services.listCities(pool));

  app.get<{ Querystring: SearchQuery }>(
    '/api/flights',
    { schema: searchFlightsSchema },
    async (request) => services.searchFlights(pool, request.query),
  );

  app.get<{ Params: { id: string } }>('/api/flights/:id', async (request) =>
    services.getFlight(pool, request.params.id),
  );

  app.post<{ Body: CreateBookingInput }>(
    '/api/bookings',
    { schema: createBookingSchema },
    async (request, reply) => {
      const booking = await services.createBooking(pool, request.body);
      return reply.code(201).send(booking);
    },
  );

  app.get<{ Params: { code: string }; Querystring: { lastName?: unknown } }>(
    '/api/bookings/:code',
    async (request) => services.getBooking(pool, request.params.code, request.query.lastName),
  );

  app.post<{ Params: { code: string }; Body: { lastName?: unknown } | null | undefined }>(
    '/api/bookings/:code/cancel',
    async (request) => services.cancelBooking(pool, request.params.code, request.body?.lastName),
  );
};
