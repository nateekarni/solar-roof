import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AlarmService } from "./alarm.service.js";
import { AlarmsController } from "./alarms.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [AlarmsController],
  providers: [AlarmService],
  exports: [AlarmService],
})
export class AlarmsModule {}
