import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  /** Origin allowed for CORS/WS in production (e.g. https://app.example.com). */
  CORS_ORIGIN: z.string().optional(),
  /** Directory of the web build to serve statically (single-process production). */
  WEB_DIST: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}
