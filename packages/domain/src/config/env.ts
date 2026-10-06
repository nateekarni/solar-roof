import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const urlString = z.string().trim().url();

const booleanFlag = z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean().default(true));
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: nonEmptyString,
  JWT_ACCESS_SECRET: nonEmptyString.min(32, "JWT_ACCESS_SECRET must be at least 32 characters long"),
  JWT_REFRESH_SECRET: nonEmptyString.min(32, "JWT_REFRESH_SECRET must be at least 32 characters long"),
  MQTT_ENABLED: booleanFlag,
  MQTT_DEFAULT_BROKER_ENABLED: booleanFlag,
  MQTT_URL: z.string().trim().default(''),
  MQTT_USERNAME: z.string().trim().default(''),
  MQTT_PASSWORD: z.string().trim().default(''),
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

export const envSchema = baseEnvSchema.superRefine((env, context) => {
  if (env.MQTT_ENABLED && env.MQTT_DEFAULT_BROKER_ENABLED) {
    for (const key of ['MQTT_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD'] as const) {
      if (!env[key]) context.addIssue({ code: 'custom', path: [key], message: 'Required when default MQTT broker is enabled' });
    }
  }
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


// The current worker hosts in-process jobs and has no external clients.
export const workerEnvSchema = baseEnvSchema.pick({ NODE_ENV: true, WORKER_PORT: true });
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export function loadWorkerEnv(input: Record<string, unknown>): WorkerEnv {
  const result = workerEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid worker environment configuration: ${result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return result.data;
}
