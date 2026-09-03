import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  /** Directory of the web build to serve statically (single-process production). */
  WEB_DIST: z.string().optional(),
  /**
   * Cloudflare Realtime TURN credentials (key id + API token). Both unset
   * is the dev default: joins get STUN only, no external credential needed.
   */
  TURN_KEY_ID: z.string().optional(),
  TURN_API_TOKEN: z.string().optional(),
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
