import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { WorkerAppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(WorkerAppModule, { logger: false });
  const port = Number(process.env.WORKER_PORT ?? 3002);

  await app.listen(port, "0.0.0.0");
  process.stdout.write(`Worker listening on http://0.0.0.0:${port}\n`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

