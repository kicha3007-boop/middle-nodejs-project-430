// Слой работы с базой: все SQL-запросы приложения собраны здесь.
// Значения передаются только параметрами ($1, $2, ...), строки запросов со входными данными
// не склеиваются. Строки базы в формат API переводит presenter.ts.
import type { Client, Pool } from './db/pool.ts';

type Queryable = Pool | Client;

export interface CityRow {
  code: string;
  name: string;
  country: string;
}

export interface FlightRow {
  id: string;
  flight_number: string;
  departure_at: Date;
  arrival_at: Date;
  duration_minutes: number;
  price_amount: number;
  currency: string;
  seats_available: number;
  airline_code: string;
  airline_name: string;
  origin_code: string;
  origin_name: string;
  origin_country: string;
  destination_code: string;
  destination_name: string;
  destination_country: string;
}

export interface BookingRow {
  id: string;
  code: string;
  status: 'confirmed' | 'cancelled';
  flight_id: string;
  contact_email: string;
  contact_phone: string;
  total_amount: number;
  currency: string;
  created_at: Date;
}

export interface PassengerRow {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  document_number: string;
}

export interface NewPassenger extends PassengerRow {
  last_name_key: string;
}

const FLIGHT_SELECT = `
  SELECT
    f.id, f.flight_number, f.departure_at, f.arrival_at, f.duration_minutes,
    f.price_amount, f.currency, f.seats_available,
    a.code AS airline_code, a.name AS airline_name,
    o.code AS origin_code, o.name AS origin_name, o.country AS origin_country,
    d.code AS destination_code, d.name AS destination_name, d.country AS destination_country
  FROM flights f
  JOIN airlines a ON a.code = f.airline_code
  JOIN cities o ON o.code = f.origin_code
  JOIN cities d ON d.code = f.destination_code
`;

export const listCities = async (db: Queryable): Promise<CityRow[]> => {
  const { rows } = await db.query<CityRow>(
    'SELECT code, name, country FROM cities ORDER BY position',
  );
  return rows;
};

// День вылета считается в UTC — в том же поясе, в котором отдаётся departureAt.
export const searchFlights = async (
  db: Queryable,
  origin: string,
  destination: string,
  day: string,
  passengers: number,
): Promise<FlightRow[]> => {
  const { rows } = await db.query<FlightRow>(
    `${FLIGHT_SELECT}
     WHERE f.origin_code = $1
       AND f.destination_code = $2
       AND f.departure_at >= $3::date::timestamptz
       AND f.departure_at < ($3::date + 1)::timestamptz
       AND f.seats_available >= $4
     ORDER BY f.departure_at, f.id`,
    [origin, destination, day, passengers],
  );
  return rows;
};

export const findFlight = async (db: Queryable, id: string): Promise<FlightRow | undefined> => {
  const { rows } = await db.query<FlightRow>(`${FLIGHT_SELECT} WHERE f.id = $1`, [id]);
  return rows[0];
};

export const insertBooking = async (
  db: Queryable,
  booking: {
    code: string;
    flightId: string;
    email: string;
    phone: string;
    totalAmount: number;
    currency: string;
  },
): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (code, flight_id, contact_email, contact_phone, total_amount, currency)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      booking.code,
      booking.flightId,
      booking.email,
      booking.phone,
      booking.totalAmount,
      booking.currency,
    ],
  );
  return rows[0].id;
};

export const insertPassengers = async (
  db: Queryable,
  bookingId: string,
  passengers: NewPassenger[],
): Promise<void> => {
  await db.query(
    `INSERT INTO booking_passengers (
       booking_id, position, first_name, last_name, last_name_key, date_of_birth, document_number
     )
     SELECT $1, t.position, t.first_name, t.last_name, t.last_name_key, t.date_of_birth, t.document
     FROM unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::date[], $7::text[])
       AS t(position, first_name, last_name, last_name_key, date_of_birth, document)`,
    [
      bookingId,
      passengers.map((_, index) => index),
      passengers.map((p) => p.first_name),
      passengers.map((p) => p.last_name),
      passengers.map((p) => p.last_name_key),
      passengers.map((p) => p.date_of_birth),
      passengers.map((p) => p.document_number),
    ],
  );
};

// Бронь находится, только если совпали код и фамилия любого её пассажира.
export const findBookingId = async (
  db: Queryable,
  code: string,
  lastNameKey: string,
): Promise<string | undefined> => {
  const { rows } = await db.query<{ id: string }>(
    `SELECT b.id
     FROM bookings b
     WHERE b.code = $1
       AND EXISTS (
         SELECT 1 FROM booking_passengers p
         WHERE p.booking_id = b.id AND p.last_name_key = $2
       )`,
    [code, lastNameKey],
  );
  return rows[0]?.id;
};

export const getBooking = async (db: Queryable, id: string): Promise<BookingRow> => {
  const { rows } = await db.query<BookingRow>(
    `SELECT id, code, status, flight_id, contact_email, contact_phone,
            total_amount, currency, created_at
     FROM bookings WHERE id = $1`,
    [id],
  );
  return rows[0];
};

export const listPassengers = async (db: Queryable, bookingId: string): Promise<PassengerRow[]> => {
  const { rows } = await db.query<PassengerRow>(
    `SELECT first_name, last_name, date_of_birth, document_number
     FROM booking_passengers WHERE booking_id = $1 ORDER BY position`,
    [bookingId],
  );
  return rows;
};

export const cancelBooking = async (db: Queryable, id: string): Promise<void> => {
  await db.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [id]);
};
