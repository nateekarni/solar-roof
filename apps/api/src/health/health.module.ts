import { Module } from "@nestjs/common";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "@solar/domain";
import { DatabaseService } from "../database/database.service.js";
import { TelemetryModule } from "../modules/telemetry/telemetry.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

@Module({
  imports: [TelemetryModule],
  controllers: [HealthController],
  providers: [{
    provide: HealthService,
    inject: [DatabaseService],
    useFactory: (db: DatabaseService) => {
      const env = loadEnv(process.env);
      const storage = new S3Client({
        endpoint: env.STORAGE_ENDPOINT,
        region: env.STORAGE_REGION,
        forcePathStyle: true,
        maxAttempts: 1,
        credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
      });
      return new HealthService([
        { name: "database", check: async () => { const query = { text: "SELECT 1", query_timeout: 2500 }; await db.pool.query(query); return true; } },
        { name: "storage", check: async signal => { await storage.send(new HeadBucketCommand({ Bucket: env.STORAGE_BUCKET }), { abortSignal: signal }); return true; } },
      ], 3000, () => storage.destroy());
    },
  }],
  exports: [HealthService],
})
export class HealthModule {}
