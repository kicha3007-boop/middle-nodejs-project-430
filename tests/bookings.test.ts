// Оформление, просмотр и отмена брони.
import { describe, expect, test } from 'vitest';

import { CONTACT, createBooking, findFlight, passenger, useApp } from './helpers.ts';

const { app } = useApp();
const CODE = /^[A-Z0-9]{6}$/;

type Payload = Record<string, unknown> & {
  contact: Record<string, unknown>;
  passengers: Record<string, unknown>[];
};

describe('create booking', () => {
  test('with one passenger', async () => {
    const flight = await findFlight(app());
    const booking = await createBooking(app(), flight, [
      passenger('Петров', { documentNumber: '1' }),
    ]);
    expect(booking.code).toMatch(CODE);
    expect(booking.status).toBe('confirmed');
    expect(booking.flight).toEqual(flight);
    expect(booking.contact).toEqual(CONTACT);
    expect(booking.passengers).toEqual([passenger('Петров', { documentNumber: '1' })]);
    expect(booking.totalPrice).toEqual(flight.price);
    expect(booking.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('total price is multiplied by passengers', async () => {
    const flight = await findFlight(app());
    const booking = await createBooking(app(), flight, [
      passenger('Петров'),
      passenger('Сидорова', { firstName: 'Анна' }),
    ]);
    expect(booking.passengers).toHaveLength(2);
    expect(booking.totalPrice).toEqual({ amount: flight.price.amount * 2, currency: 'RUB' });
  });

  test('booking codes are unique', async () => {
    const flight = await findFlight(app());
    const codes = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      codes.add((await createBooking(app(), flight)).code);
    }
    expect(codes.size).toBe(5);
  });

  test('client total price is ignored', async () => {
    const flight = await findFlight(app());
    const response = await app().inject({
      method: 'POST',
      url: '/api/bookings',
      payload: {
        flightId: flight.id,
        contact: CONTACT,
        passengers: [passenger()],
        totalPrice: { amount: 1, currency: 'RUB' },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().totalPrice.amount).toBe(flight.price.amount);
  });

  test.each<[string, (payload: Payload) => void]>([
    [
      'empty passengers',
      (p) => {
        p.passengers = [];
      },
    ],
    [
      'no passengers',
      (p) => {
        delete (p as Record<string, unknown>).passengers;
      },
    ],
    [
      'no contact',
      (p) => {
        delete (p as Record<string, unknown>).contact;
      },
    ],
    [
      'empty email',
      (p) => {
        p.contact.email = '';
      },
    ],
    [
      'blank phone',
      (p) => {
        p.contact.phone = '   ';
      },
    ],
    [
      'empty last name',
      (p) => {
        p.passengers[0].lastName = '';
      },
    ],
    [
      'no document number',
      (p) => {
        delete p.passengers[0].documentNumber;
      },
    ],
    [
      'date of birth is not a date',
      (p) => {
        p.passengers[0].dateOfBirth = 'вчера';
      },
    ],
    [
      'unknown flight',
      (p) => {
        p.flightId = 'NOPE';
      },
    ],
    [
      'empty flightId',
      (p) => {
        p.flightId = '';
      },
    ],
  ])('%s is validation error', async (_name, change) => {
    const flight = await findFlight(app());
    const payload: Payload = {
      flightId: flight.id,
      contact: { ...CONTACT },
      passengers: [passenger()],
    };
    change(payload);
    const response = await app().inject({ method: 'POST', url: '/api/bookings', payload });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ code: string; message: string }>();
    expect(body.code).toBe('validation_error');
    expect(body.message).not.toBe('');
  });

  test('malformed JSON is validation error', async () => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
  });
});

describe('lookup booking', () => {
  test('found by code and any passenger last name', async () => {
    const flight = await findFlight(app());
    const booking = await createBooking(app(), flight, [
      passenger('Петров'),
      passenger('Сидорова'),
    ]);
    const response = await app().inject({
      method: 'GET',
      url: `/api/bookings/${booking.code}`,
      query: { lastName: 'Сидорова' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(booking);
  });

  test('last name comparison ignores case and outer spaces', async () => {
    const booking = await createBooking(app(), await findFlight(app()));
    const response = await app().inject({
      method: 'GET',
      url: `/api/bookings/${booking.code}`,
      query: { lastName: '  пЕТРОВ ' },
    });
    expect(response.statusCode).toBe(200);
  });

  test('booking code is case insensitive', async () => {
    const booking = await createBooking(app(), await findFlight(app()));
    const response = await app().inject({
      method: 'GET',
      url: `/api/bookings/${booking.code.toLowerCase()}`,
      query: { lastName: 'Петров' },
    });
    expect(response.statusCode).toBe(200);
  });

  test('failures give identical 404', async () => {
    const booking = await createBooking(app(), await findFlight(app()));
    const urls = [
      '/api/bookings/ZZZZZZ?lastName=Петров',
      `/api/bookings/${booking.code}?lastName=Иванов`,
      `/api/bookings/${booking.code}`,
      `/api/bookings/${booking.code}?lastName=`,
    ];
    const bodies = new Set<string>();
    for (const url of urls) {
      const response = await app().inject({ method: 'GET', url: encodeURI(url) });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'not_found' });
      bodies.add(response.body);
    }
    expect(bodies.size).toBe(1);
  });
});

describe('cancel booking', () => {
  test('returns cancelled booking which is still found', async () => {
    const booking = await createBooking(app(), await findFlight(app()));
    const response = await app().inject({
      method: 'POST',
      url: `/api/bookings/${booking.code}/cancel`,
      payload: { lastName: 'петров' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      code: booking.code,
      status: 'cancelled',
      passengers: booking.passengers,
    });

    const found = await app().inject({
      method: 'GET',
      url: `/api/bookings/${booking.code}`,
      query: { lastName: 'Петров' },
    });
    expect(found.json().status).toBe('cancelled');
  });

  test('repeated cancel is ok', async () => {
    const booking = await createBooking(app(), await findFlight(app()));
    const cancel = () =>
      app().inject({
        method: 'POST',
        url: `/api/bookings/${booking.code}/cancel`,
        payload: { lastName: 'Петров' },
      });
    expect((await cancel()).statusCode).toBe(200);
    const response = await cancel();
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('cancelled');
  });

  test('failures give 404 and keep booking confirmed', async () => {
    const booking = await createBooking(app(), await findFlight(app()));
    const url = `/api/bookings/${booking.code}/cancel`;
    const attempts = [
      app().inject({ method: 'POST', url, payload: { lastName: 'Иванов' } }),
      app().inject({ method: 'POST', url, payload: {} }),
      app().inject({ method: 'POST', url }),
      app().inject({
        method: 'POST',
        url: '/api/bookings/ZZZZZZ/cancel',
        payload: { lastName: 'Петров' },
      }),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'not_found' });
    }

    const found = await app().inject({
      method: 'GET',
      url: `/api/bookings/${booking.code}`,
      query: { lastName: 'Петров' },
    });
    expect(found.json().status).toBe('confirmed');
  });
});
