import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const port = Number(process.env.API_PORT ?? 3001);

  await app.listen(port, "0.0.0.0");
  process.stdout.write(`API listening on http://0.0.0.0:${port}\n`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

