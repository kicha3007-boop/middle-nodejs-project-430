import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Миграции и справочные данные — один раз на прогон, до всех тестов.
    globalSetup: ['tests/globalSetup.ts'],
    // Файлы тестов делят одну базу; каждый тест готовит свои данные сам.
    fileParallelism: false,
  },
});
