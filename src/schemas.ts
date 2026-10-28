// JSON-схемы входных данных. Fastify проверяет по ним запрос до обработчика, а провал
// валидации превращается в 400 validation_error в обработчике ошибок.
// Проверяются наличие и непустота полей, а не форматы: номер документа «1» допустим.
// Исключение — даты: строка, которая не разбирается как дата, отсекается здесь, а не ошибкой базы.

// Непустая строка: хотя бы один непробельный символ.
const nonEmptyString = { type: 'string', minLength: 1, pattern: '\\S' } as const;
const isoDate = { type: 'string', format: 'date' } as const;

export const searchFlightsSchema = {
  querystring: {
    type: 'object',
    required: ['origin', 'destination', 'date'],
    properties: {
      origin: nonEmptyString,
      destination: nonEmptyString,
      date: isoDate,
      passengers: { type: 'integer', minimum: 1, default: 1 },
    },
  },
} as const;

export const createBookingSchema = {
  body: {
    type: 'object',
    required: ['flightId', 'contact', 'passengers'],
    properties: {
      flightId: nonEmptyString,
      contact: {
        type: 'object',
        required: ['email', 'phone'],
        properties: { email: nonEmptyString, phone: nonEmptyString },
      },
      passengers: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['firstName', 'lastName', 'dateOfBirth', 'documentNumber'],
          properties: {
            firstName: nonEmptyString,
            lastName: nonEmptyString,
            dateOfBirth: isoDate,
            documentNumber: nonEmptyString,
          },
        },
      },
    },
  },
} as const;
