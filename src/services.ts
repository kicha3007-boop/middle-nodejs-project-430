// Сценарии API поверх слоя базы: поиск рейсов, оформление, просмотр и отмена брони.
import { generateBookingCode, normalizeBookingCode } from './bookingCode.ts';
import { type Client, type Pool, withTransaction } from './db/pool.ts';
import { notFound, validationError } from './errors.ts';
import {
  type BookingDto,
  type FlightDto,
  presentBooking,
  presentCity,
  presentFlight,
} from './presenter.ts';
import * as repository from './repository.ts';

const BOOKING_NOT_FOUND = 'Бронь не найдена: проверьте код и фамилию';
const CODE_ATTEMPTS = 10;
const UNIQUE_VIOLATION = '23505';

export interface CreateBookingInput {
  flightId: string;
  contact: { email: string; phone: string };
  passengers: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    documentNumber: string;
  }[];
}

const normalizeLastName = (lastName: string): string => lastName.trim().toLowerCase();

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;

export const listCities = async (pool: Pool) =>
  (await repository.listCities(pool)).map(presentCity);

export const searchFlights = async (
  pool: Pool,
  params: { origin: string; destination: string; date: string; passengers: number },
): Promise<FlightDto[]> => {
  const rows = await repository.searchFlights(
    pool,
    params.origin.toUpperCase(),
    params.destination.toUpperCase(),
    params.date,
    params.passengers,
  );
  return rows.map(presentFlight);
};

export const getFlight = async (pool: Pool, id: string): Promise<FlightDto> => {
  const row = await repository.findFlight(pool, id);
  if (!row) {
    throw notFound('Рейс не найден');
  }
  return presentFlight(row);
};

const loadBooking = async (db: Pool | Client, bookingId: string): Promise<BookingDto> => {
  const booking = await repository.getBooking(db, bookingId);
  const flight = await repository.findFlight(db, booking.flight_id);
  const passengers = await repository.listPassengers(db, bookingId);
  if (!flight) {
    throw new Error(`У брони ${booking.code} нет рейса ${booking.flight_id}`);
  }
  return presentBooking(booking, flight, passengers);
};

const insertBookingOnce = async (
  pool: Pool,
  input: CreateBookingInput,
  totalAmount: number,
  currency: string,
): Promise<string> =>
  // Бронь и пассажиры — одна транзакция: если запись пассажиров упала, брони не останется.
  withTransaction(pool, async (client) => {
    const bookingId = await repository.insertBooking(client, {
      code: generateBookingCode(),
      flightId: input.flightId,
      email: input.contact.email,
      phone: input.contact.phone,
      totalAmount,
      currency,
    });
    await repository.insertPassengers(
      client,
      bookingId,
      input.passengers.map((p) => ({
        first_name: p.firstName,
        last_name: p.lastName,
        last_name_key: normalizeLastName(p.lastName),
        date_of_birth: p.dateOfBirth,
        document_number: p.documentNumber,
      })),
    );
    return bookingId;
  });

export const createBooking = async (pool: Pool, input: CreateBookingInput): Promise<BookingDto> => {
  const flight = await repository.findFlight(pool, input.flightId);
  if (!flight) {
    throw validationError('Рейс с таким flightId не найден');
  }
  // Стоимость считает сервер: цена рейса за одного пассажира × число пассажиров.
  const totalAmount = flight.price_amount * input.passengers.length;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      const bookingId = await insertBookingOnce(pool, input, totalAmount, flight.currency);
      return await loadBooking(pool, bookingId);
    } catch (error) {
      // Совпал код брони — транзакция уже откатилась, пробуем с новым кодом.
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
  throw new Error('Не удалось подобрать уникальный код брони');
};

// Неверный код, неверная и отсутствующая фамилия дают один и тот же ответ.
const findBookingId = async (pool: Pool, code: string, lastName: unknown): Promise<string> => {
  if (typeof lastName !== 'string' || lastName.trim() === '') {
    throw notFound(BOOKING_NOT_FOUND);
  }
  const bookingId = await repository.findBookingId(
    pool,
    normalizeBookingCode(code),
    normalizeLastName(lastName),
  );
  if (!bookingId) {
    throw notFound(BOOKING_NOT_FOUND);
  }
  return bookingId;
};

export const getBooking = async (pool: Pool, code: string, lastName: unknown) =>
  loadBooking(pool, await findBookingId(pool, code, lastName));

// Бронь не удаляется — меняется статус. Повторная отмена снова даёт cancelled.
export const cancelBooking = async (pool: Pool, code: string, lastName: unknown) => {
  const bookingId = await findBookingId(pool, code, lastName);
  await repository.cancelBooking(pool, bookingId);
  return loadBooking(pool, bookingId);
};
