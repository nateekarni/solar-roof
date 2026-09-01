import { Module } from "@nestjs/common";
import { AlarmService } from "./alarm.service.js";
@Module({providers:[AlarmService],exports:[AlarmService]})
export class AlarmsModule {}
