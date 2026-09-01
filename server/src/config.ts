import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  /** Origem permitida no CORS/WS em produção (ex.: https://app.exemplo.com). */
  CORS_ORIGIN: z.string().optional(),
  /** Diretório do build do web para servir estático (produção single-process). */
  WEB_DIST: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuração inválida: ${issues}`);
  }
  return parsed.data;
}
