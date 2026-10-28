// Сборка приложения: API под /api, статика фронтенда, SPA-fallback и единый формат ошибок.
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';

import { PUBLIC_DIR } from './config.ts';
import type { Pool } from './db/pool.ts';
import { ApiError, FRAMEWORK_CODES } from './errors.ts';
import { registerApiRoutes } from './routes.ts';

interface AppOptions {
  pool: Pool;
  publicDir?: string;
  logger?: boolean;
}

const describeValidation = (error: FastifyError): string => {
  const [first] = error.validation ?? [];
  if (!first) {
    return error.message;
  }
  const where = error.validationContext === 'querystring' ? 'параметр' : 'поле';
  if (first.keyword === 'required') {
    const missing = String(first.params.missingProperty);
    const parent = first.instancePath.replace(/^\//, '').replaceAll('/', '.');
    return `Не заполнен обязательный ${where} ${parent ? `${parent}.` : ''}${missing}`;
  }
  const field = first.instancePath.replace(/^\//, '').replaceAll('/', '.');
  return field ? `Некорректное значение: ${where} ${field}` : 'Некорректный запрос';
};

export const buildApp = (options: AppOptions): FastifyInstance => {
  const app = Fastify({ logger: options.logger ?? false });

  // Статика из public/: существующие файлы отдаются со своими типами. Путь из запроса
  // за пределы root не выходит — на «..» плагин отвечает 403.
  app.register(fastifyStatic, { root: options.publicDir ?? PUBLIC_DIR });

  registerApiRoutes(app, options.pool);

  // Маршрут не найден ни в API, ни среди файлов статики. Под /api/ — JSON 404,
  // всё остальное — адрес фронтенда, отдаём index.html (SPA-fallback).
  app.setNotFoundHandler((request, reply) => {
    if (request.url === '/api' || request.url.startsWith('/api/')) {
      return reply.code(404).send({ code: 'not_found', message: 'Неизвестный адрес API' });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return reply
        .code(405)
        .send({ code: 'method_not_allowed', message: `Метод ${request.method} не поддерживается` });
    }
    return reply.type('text/html; charset=utf-8').sendFile('index.html');
  });

  // Единый формат ошибок {code, message} на всё приложение.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.status).send({ code: error.code, message: error.message });
    }
    if (error.validation) {
      return reply.code(400).send({ code: 'validation_error', message: describeValidation(error) });
    }
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply
        .code(status)
        .send({ code: FRAMEWORK_CODES[status] ?? 'error', message: error.message });
    }
    // Пятисотка не несёт деталей клиенту, но целиком попадает в лог.
    request.log.error(error);
    return reply.code(500).send({ code: 'internal_error', message: 'Внутренняя ошибка сервера' });
  });

  return app;
};
