// Ошибки API: в каждой лежит и HTTP-статус, и код ошибки из контракта.
// Классы объявлены один раз — иначе instanceof в обработчике ошибок не сработает.

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const validationError = (message: string): ApiError =>
  new ApiError(400, 'validation_error', message);

export const notFound = (message: string): ApiError => new ApiError(404, 'not_found', message);

// Клиентские ошибки самого фреймворка приходят без кода из контракта — подставляем его по статусу.
export const FRAMEWORK_CODES: Record<number, string> = {
  400: 'validation_error',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'payload_too_large',
  415: 'validation_error',
};
