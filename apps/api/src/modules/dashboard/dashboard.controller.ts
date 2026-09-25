import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service.js";

@Controller("v1/dashboard")
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService
  ) {}

  @Get("summary")
  getSummary(
    @Query("start_date") startDateStr?: string,
    @Query("end_date") endDateStr?: string,
    @Query("month") month?: string,
    @Query("year") year?: string
  ) {
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    if (startDateStr && !ISO_DATE.test(startDateStr)) {
      throw new BadRequestException("start_date must be in YYYY-MM-DD format");
    }
    if (endDateStr && !ISO_DATE.test(endDateStr)) {
      throw new BadRequestException("end_date must be in YYYY-MM-DD format");
    }

    let startDate = startDateStr;
    let endDate = endDateStr;

    // Backward compatibility for legacy month/year query params
    if (!startDate && !endDate && month && year) {
      const m = Number(month);
      const y = Number(year);
      if (!Number.isNaN(m) && !Number.isNaN(y) && m >= 1 && m <= 12) {
        startDate = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
        endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      }
    }

    // Default to current month if no range is specified
    if (!startDate || !endDate) {
      const now = new Date();
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10);
      endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
    }

    if (startDate > endDate) {
      throw new BadRequestException("end_date must not be before start_date");
    }

    return this.dashboard.getSummary(startDate, endDate);
  }

  @Get("production")
  getProduction(
    @Query("period") period = "day",
    @Query("month") month?: string,
    @Query("year") year?: string
  ) {
    return this.dashboard.getProduction(
      period,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined
    );
  }

  @Get("revenue")
  getRevenue(
    @Query("period") period = "month",
    @Query("month") month?: string,
    @Query("year") year?: string
  ) {
    return this.dashboard.getRevenue(
      period,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined
    );
  }

  @Get("compare")
  compare(
    @Query("metric") metric = "installedMwp",
    @Query("school_ids") schoolIdsStr?: string,
    @Query("start_date") startDate?: string,
    @Query("end_date") endDate?: string,
  ) {
    const schoolIds = schoolIdsStr
      ? schoolIdsStr.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    return this.dashboard.compare(metric, schoolIds, startDate, endDate);
  }

  @Get("power-flow")
  getPowerFlow(
    @Query("school_id") schoolId?: string,
    @Query("site_id") siteId?: string
  ) {
    return this.dashboard.getPowerFlow(schoolId, siteId);
  }
}
