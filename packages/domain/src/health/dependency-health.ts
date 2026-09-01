import type { AppEnv } from "../config/env.js";

export type DependencyStatus = "healthy" | "degraded" | "missing";

export interface DependencyHealth {
  name: string;
  status: DependencyStatus;
  configured: boolean;
}

export interface ServiceHealth {
  service: string;
  status: "healthy" | "degraded";
  dependencies: DependencyHealth[];
}

function dependency(name: string, configured: boolean, required = true): DependencyHealth {
  return {
    name,
    configured,
    status: configured ? "healthy" : required ? "missing" : "degraded"
  };
}

export function buildDependencyHealth(service: string, env: AppEnv): ServiceHealth {
  const dependencies: DependencyHealth[] = [
    dependency("database", Boolean(env.DATABASE_URL)),
    dependency("jwt", Boolean(env.JWT_ACCESS_SECRET) && Boolean(env.JWT_REFRESH_SECRET)),
    dependency("mqtt", Boolean(env.MQTT_URL) && Boolean(env.MQTT_USERNAME) && Boolean(env.MQTT_PASSWORD)),
    dependency(
      "storage",
      Boolean(env.STORAGE_ENDPOINT) && Boolean(env.STORAGE_BUCKET) && Boolean(env.STORAGE_ACCESS_KEY) && Boolean(env.STORAGE_SECRET_KEY)
    ),
    dependency("redis", Boolean(env.REDIS_URL), false)
  ];

  return {
    service,
    status: dependencies.some((item) => item.status !== "healthy") ? "degraded" : "healthy",
    dependencies
  };
}