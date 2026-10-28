// Перевод строк базы в формат ответов API: camelCase, время в UTC с Z, числа числами.
import type { BookingRow, CityRow, FlightRow, PassengerRow } from './repository.ts';

// 2026-08-03T08:00:00.000Z → 2026-08-03T08:00:00Z, как в контракте.
export const formatDateTime = (value: Date): string =>
  value.toISOString().replace(/\.\d{3}Z$/, 'Z');

export const presentCity = (row: CityRow) => ({
  code: row.code,
  name: row.name,
  country: row.country,
});

export const presentFlight = (row: FlightRow) => ({
  id: row.id,
  flightNumber: row.flight_number,
  airline: { code: row.airline_code, name: row.airline_name },
  origin: { code: row.origin_code, name: row.origin_name, country: row.origin_country },
  destination: {
    code: row.destination_code,
    name: row.destination_name,
    country: row.destination_country,
  },
  departureAt: formatDateTime(row.departure_at),
  arrivalAt: formatDateTime(row.arrival_at),
  durationMinutes: row.duration_minutes,
  price: { amount: row.price_amount, currency: row.currency },
  seatsAvailable: row.seats_available,
});

export const presentPassenger = (row: PassengerRow) => ({
  firstName: row.first_name,
  lastName: row.last_name,
  dateOfBirth: row.date_of_birth,
  documentNumber: row.document_number,
});

export const presentBooking = (
  booking: BookingRow,
  flight: FlightRow,
  passengers: PassengerRow[],
) => ({
  code: booking.code,
  status: booking.status,
  flight: presentFlight(flight),
  passengers: passengers.map(presentPassenger),
  contact: { email: booking.contact_email, phone: booking.contact_phone },
  totalPrice: { amount: booking.total_amount, currency: booking.currency },
  createdAt: formatDateTime(booking.created_at),
});

export type FlightDto = ReturnType<typeof presentFlight>;
export type BookingDto = ReturnType<typeof presentBooking>;
