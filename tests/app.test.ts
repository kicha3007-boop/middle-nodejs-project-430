// Хелсчек, раздача фронтенда, SPA-fallback и формат ошибок фреймворка.
import { describe, expect, test } from 'vitest';

import { useApp } from './helpers.ts';

const { app } = useApp();

describe('app', () => {
  test('health check', async () => {
    const response = await app().inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  test('HEAD on existing API route answers like GET without body', async () => {
    const get = await app().inject({ method: 'GET', url: '/api/cities' });
    const head = await app().inject({ method: 'HEAD', url: '/api/cities' });
    expect(head.statusCode).toBe(200);
    expect(head.headers['content-type']).toBe(get.headers['content-type']);
    expect(head.body).toBe('');
  });

  test('HEAD on frontend route', async () => {
    const response = await app().inject({ method: 'HEAD', url: '/lookup' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });

  test.each(['/', '/lookup', '/booking/MOWLED-20260101-1'])(
    'direct link %s serves index.html',
    async (url) => {
      const response = await app().inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/html/);
      expect(response.body).toContain("id='root'");
    },
  );

  test('static file is served with its own type', async () => {
    const response = await app().inject({ method: 'GET', url: '/assets/app.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
    expect(response.body).toContain('asset');
  });

  test('path traversal does not leave public dir', async () => {
    for (const url of ['/../secret.txt', '/..%2Fsecret.txt', '/assets/..%2F..%2Fsecret.txt']) {
      const response = await app().inject({ method: 'GET', url });
      expect(response.body).not.toContain('secret');
    }
  });

  test('unknown API path returns JSON 404', async () => {
    for (const method of ['GET', 'POST'] as const) {
      const response = await app().inject({ method, url: '/api/unknown' });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.json()).toMatchObject({ code: 'not_found' });
    }
  });

  test('unsupported method outside API returns JSON error', async () => {
    const response = await app().inject({ method: 'DELETE', url: '/lookup' });
    expect(response.statusCode).toBe(405);
    expect(response.json()).toMatchObject({ code: 'method_not_allowed' });
  });
});
