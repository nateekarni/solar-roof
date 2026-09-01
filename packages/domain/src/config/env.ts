import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const urlString = z.string().trim().url();

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: nonEmptyString,
  JWT_ACCESS_SECRET: nonEmptyString.min(32, "JWT_ACCESS_SECRET must be at least 32 characters long"),
  JWT_REFRESH_SECRET: nonEmptyString.min(32, "JWT_REFRESH_SECRET must be at least 32 characters long"),
  MQTT_URL: nonEmptyString,
  MQTT_USERNAME: nonEmptyString,
  MQTT_PASSWORD: nonEmptyString,
  STORAGE_ENDPOINT: urlString,
  STORAGE_REGION: nonEmptyString,
  STORAGE_BUCKET: nonEmptyString,
  STORAGE_ACCESS_KEY: nonEmptyString,
  STORAGE_SECRET_KEY: nonEmptyString,
  REDIS_URL: nonEmptyString.optional(),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WORKER_PORT: z.coerce.number().int().positive().default(3002)
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

