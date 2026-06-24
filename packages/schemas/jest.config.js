/**
 * ts-jest dipaksa meng-emit CommonJS (tsconfig package memakai module ESNext untuk
 * build tsup/dts). Mode transpile-only diambil dari `isolatedModules: true` di
 * @paax/tsconfig/base.json — cukup untuk uji parsing Zod runtime.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
        },
      },
    ],
  },
};
