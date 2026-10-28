# Локальные переменные окружения (DATABASE_URL, PORT) из .env, если файл есть.
-include .env
export

FRONTEND_DIST = node_modules/@hexlet/js-flight-booking-frontend/dist

.PHONY: install build start test lint format migrate seed contract db-up db-down

install:
	npm ci

# Раскладывает собранный фронтенд в public/. К базе не обращается.
build:
	rm -rf public/assets public/index.html
	mkdir -p public
	cp -R $(FRONTEND_DIST)/. public/

# Миграции и справочные данные, затем сервер. Повторный запуск безопасен и ничего не удаляет.
start:
	node src/cli.ts prepare
	PORT=$${PORT:-8080} node src/server.ts

migrate:
	node src/cli.ts migrate

seed:
	node src/cli.ts seed

test:
	npx vitest run

# Линтер, проверка формата и проверка типов: сборки нет, ошибки типов видны только здесь.
lint:
	npx eslint .
	npx prettier --check .
	npx tsc

format:
	npx prettier --write .
	npx eslint --fix .

# Пересборка contract/openapi.yaml из contract/main.tsp.
contract:
	npx tsp compile contract

# Локальная база в Docker (см. docker-compose.yml).
db-up:
	docker compose up -d db

db-down:
	docker compose down
