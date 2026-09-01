/**
 * Version and build stamped into the bundle by vite.config.ts (`define`).
 *
 * The guards keep any environment that skips the define step (a bare tsx
 * runner, a future test harness) rendering 'dev' instead of crashing on a
 * bare identifier — `typeof` on an undeclared global is always safe.
 */
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export const APP_BUILD: string = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';
