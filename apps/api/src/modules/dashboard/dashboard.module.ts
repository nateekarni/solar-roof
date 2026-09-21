import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { OperationsController } from "./operations.controller.js";
import { OperationsService } from "./operations.service.js";

@Module({ controllers: [DashboardController, OperationsController], providers: [DashboardService, OperationsService] })
export class DashboardModule {}
