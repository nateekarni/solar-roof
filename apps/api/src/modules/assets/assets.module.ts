import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
