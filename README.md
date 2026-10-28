# Бекенд для бронирования авиабилетов (Node.js)

[![hexlet-check](https://github.com/kicha3007-boop/middle-nodejs-project-430/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/kicha3007-boop/middle-nodejs-project-430/actions)
[![CI](https://github.com/kicha3007-boop/middle-nodejs-project-430/actions/workflows/ci.yml/badge.svg)](https://github.com/kicha3007-boop/middle-nodejs-project-430/actions/workflows/ci.yml)

HTTP API сервиса бронирования авиабилетов: справочник городов, поиск рейсов, оформление, просмотр
и отмена брони. Код на TypeScript, данные хранятся в PostgreSQL. Фронтенд — готовое приложение
Хекслета (npm-пакет `@hexlet/js-flight-booking-frontend`), сервер раздаёт его на том же порту, что и API.

Учебный проект Хекслета: https://ru.hexlet.io/programs/middle-nodejs
Как это должно работать: https://files.hexlet.app/a/5bi6gu

## Стек

- Node.js 22.18+ (TypeScript исполняется нодой напрямую, без сборки), Fastify, @fastify/static
- PostgreSQL, драйвер `pg`, миграции на голом SQL
- Vitest, ESLint + typescript-eslint, Prettier, `tsc` для проверки типов
- TypeSpec → OpenAPI (`contract/`)

## Требования

- Node.js 22.18 или новее (рекомендуется 24+) и npm
- PostgreSQL — своя или в Docker (`docker compose up -d db`)
- GNU Make

## Быстрый старт

```bash
git clone https://github.com/kicha3007-boop/middle-nodejs-project-430.git
cd middle-nodejs-project-430

cp .env.example .env     # DATABASE_URL и PORT; Makefile читает .env сам
make db-up               # PostgreSQL в Docker на localhost:5432 (или своя база)
make install             # npm ci
make build               # раскладывает фронтенд в public/, к базе не обращается
make start               # миграции + справочные данные + сервер на 0.0.0.0:$PORT
```

Откройте http://localhost:8080 — главная сразу покажет рейсы Москва → Санкт-Петербург на сегодня.

Всё в контейнерах одной командой (база + приложение из `Dockerfile`):

```bash
docker compose up --build
```

## Переменные окружения

| Переменная     | Назначение                                                                                               | По умолчанию |
| -------------- | -------------------------------------------------------------------------------------------------------- | ------------ |
| `DATABASE_URL` | строка подключения к PostgreSQL, например `postgresql://postgres:postgres@localhost:5432/flight_booking` | обязательна  |
| `PORT`         | порт HTTP-сервера                                                                                        | `8080`       |

Шаблон — `.env.example`. Сам `.env` в репозиторий не попадает.

## Команды

| Команда                       | Что делает                                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| `make install`                | `npm ci`                                                           |
| `make build`                  | копирует собранный фронтенд из `node_modules` в `public/`          |
| `make start`                  | применяет миграции, загружает справочник и рейсы, запускает сервер |
| `make migrate` / `make seed`  | только миграции / только загрузка данных                           |
| `make test`                   | тесты на API (Vitest), нужна база по `DATABASE_URL`                |
| `make lint`                   | ESLint, проверка формата Prettier и проверка типов `tsc`           |
| `make format`                 | автоисправление стиля                                              |
| `make contract`               | пересборка `contract/openapi.yaml` из `contract/main.tsp`          |
| `make db-up` / `make db-down` | локальная PostgreSQL в Docker                                      |

`make start` можно запускать повторно: применённые миграции учитываются в `schema_migrations`,
справочники обновляются по ключу, у рейсов детерминированные id — дублей нет, данные не стираются.

## Тесты и линтер

```bash
make db-up
make test   # Vitest + app.inject: запрос проходит весь стек Fastify без сети
make lint
```

Перед тестами `tests/globalSetup.ts` применяет миграции и загружает данные в базу из `DATABASE_URL`.
Каждый тест готовит свои данные: дату поиска считает от сегодняшнего дня, бронь создаёт свою.

В GitHub Actions (`.github/workflows/ci.yml`) на каждый пуш: установка зависимостей, сборка,
линтер с проверкой типов и тесты с PostgreSQL в сервис-контейнере.

## API

Полный контракт — `contract/openapi.yaml` (исходник — `contract/main.tsp`).

| Метод | Путь                                                  | Назначение                                            |
| ----- | ----------------------------------------------------- | ----------------------------------------------------- |
| GET   | `/api/health`                                         | хелсчек `{"status": "ok"}`                            |
| GET   | `/api/cities`                                         | справочник городов (Москва и Санкт-Петербург первыми) |
| GET   | `/api/flights?origin=&destination=&date=&passengers=` | поиск рейсов                                          |
| GET   | `/api/flights/{id}`                                   | рейс по идентификатору                                |
| POST  | `/api/bookings`                                       | создать бронь (201)                                   |
| GET   | `/api/bookings/{code}?lastName=`                      | просмотр брони по коду и фамилии                      |
| POST  | `/api/bookings/{code}/cancel`                         | отмена брони, фамилия в теле `{"lastName": "..."}`    |

Ошибки — `{"code": "validation_error" | "not_found", "message": "..."}` с кодами 400 и 404.
Всё, что не начинается с `/api/` и не является файлом статики, отдаёт `index.html` (SPA-fallback).

```bash
curl http://localhost:8080/api/cities
curl "http://localhost:8080/api/flights?origin=MOW&destination=LED&date=$(date -u +%F)"
```

## Устройство

```text
src/server.ts        точка входа: 0.0.0.0 и порт из PORT
src/app.ts           сборка Fastify: статика, SPA-fallback, единый обработчик ошибок
src/routes.ts        тонкие обработчики API
src/schemas.ts       JSON-схемы запросов (наличие и непустота полей)
src/services.ts      сценарии: поиск, оформление, просмотр и отмена брони
src/repository.ts    все SQL-запросы (параметризованные)
src/presenter.ts     строки базы → JSON по контракту (camelCase, время UTC с Z)
src/errors.ts        ApiError и коды ошибок
src/bookingCode.ts   генерация кода брони
src/db/pool.ts       пул pg, пояс UTC, транзакции
src/db/migrate.ts    применение migrations/NNNN_*.sql по номеру
src/db/seed.ts       города, авиакомпании, рейсы на 30 дней от текущей даты
src/cli.ts           node src/cli.ts migrate | seed | prepare
```

## Docker

`Dockerfile` в корне собирает образ приложения: ставит зависимости без dev, раскладывает фронтенд
и запускает `make start`. Проверить локально:

```bash
docker build -t flight-booking .
docker run --rm -e PORT=8080 -e DATABASE_URL=<строка подключения> -p 8080:8080 flight-booking
```

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
