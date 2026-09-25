import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

@Injectable()
export class DashboardService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getSummary(startDate: string, endDate: string) {
    const days =
      Math.ceil(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) /
          86_400_000
      ) + 1;
    const bucket = days <= 60 ? "day" : "month";

    const [stats, series, rankings, alerts, collection, sites, revenueSeries] =
      await Promise.all([
        this.db.query<{
          schools: string;
          online_sites: string;
          installed_mwp: string;
          current_mw: string;
          period_kwh: string;
          period_amount: string;
        }>(
          `SELECT 
            (SELECT count(*) FROM schools WHERE status='active') schools, 
            (SELECT count(*) FROM sites WHERE status='online') online_sites, 
            (SELECT coalesce(sum(capacity_mwp),0) FROM sites WHERE status <> 'inactive') installed_mwp, 
            (SELECT coalesce(sum(site_mw),0) FROM (
              SELECT site_id, greatest(max(normalized_value)-min(normalized_value),0) * 4 / 1000 site_mw 
              FROM telemetry_raw 
              WHERE semantic_field='total_energy' 
                AND source_time >= (SELECT coalesce(max(source_time), now()) FROM telemetry_raw WHERE semantic_field='total_energy') - interval '15 minutes' 
              GROUP BY site_id
            ) current_values) current_mw, 
            (SELECT coalesce(sum(consumed_kwh),0) FROM billing_cycles WHERE period_start >= $1 AND period_start <= $2) period_kwh, 
            (SELECT coalesce(sum(amount),0) FROM billing_cycles WHERE period_start >= $1 AND period_start <= $2) period_amount`,
          [startDate, endDate]
        ),

        this.db.query<{ bucket_start: string; value: string; quality: string }>(
          `SELECT date_trunc($1, bucket_start)::date::text AS bucket_start, round(sum(value)::numeric, 2) AS value,
                  CASE WHEN bool_and(quality = 'complete') THEN 'complete' ELSE 'partial' END AS quality
           FROM telemetry_aggregate 
           WHERE bucket = $1 
             AND semantic_field = 'total_energy'
             AND bucket_start >= $2::date
             AND bucket_start < ($3::date + interval '1 day')
           GROUP BY date_trunc($1, bucket_start)
           ORDER BY 1 ASC`,
          [bucket, startDate, endDate]
        ),

        this.db.query<{ site_name: string; production_kwh: string }>(
          `SELECT s.name AS site_name, round(greatest(coalesce(max(a.value)-min(a.value), 0), 0)::numeric,2) AS production_kwh 
           FROM sites s 
           LEFT JOIN telemetry_aggregate a ON s.id=a.site_id AND a.bucket='15m' AND a.semantic_field='total_energy'
           GROUP BY s.id, s.name 
           ORDER BY production_kwh DESC 
           LIMIT 5`,
        ),

        this.db.query<{
          title: string;
          detail: string;
          severity: string;
          status: string;
          occurred_at: string;
        }>(
          `SELECT title, detail, severity, status, occurred_at 
           FROM alerts 
           ORDER BY occurred_at DESC 
           LIMIT 5`,
        ),

        this.db.query<{
          total: string;
          paid: string;
          pending: string;
          unbilled: string;
        }>(
          `SELECT 
            coalesce(sum(b.amount),0) total, 
            coalesce(sum(b.amount) FILTER (WHERE p.status='paid'),0) paid, 
            coalesce(sum(b.amount) FILTER (WHERE p.status='pending'),0) pending,
            coalesce(sum(b.amount) FILTER (WHERE p.status IS NULL),0) unbilled
           FROM billing_cycles b 
           LEFT JOIN payments p ON p.billing_cycle_id=b.id 
           WHERE b.period_start >= $1 AND b.period_start <= $2`,
          [startDate, endDate]
        ),

        this.db.query<{
          id: string;
          name: string;
          latitude: string | null;
          longitude: string | null;
          status: string;
          capacity_mwp: string;
          school_name: string;
          production_kwh: string;
        }>(
          `SELECT 
            s.id, s.name, s.latitude, s.longitude, s.status, s.capacity_mwp, 
            sc.name AS school_name, 
            round(greatest(coalesce(max(a.value)-min(a.value), 0), 0)::numeric,2) AS production_kwh 
           FROM sites s 
           JOIN schools sc ON sc.id=s.school_id 
           LEFT JOIN telemetry_aggregate a ON a.site_id=s.id AND a.semantic_field='total_energy' AND a.bucket='15m' 
           GROUP BY s.id, s.name, s.latitude, s.longitude, s.status, s.capacity_mwp, sc.name 
           ORDER BY s.name`,
        ),

        this.db.query<{ day: string; revenue: string }>(
          `SELECT 
            period_end::text AS day,
            coalesce(sum(amount), 0) AS revenue
           FROM billing_cycles
           WHERE period_start >= $1 AND period_start <= $2
           GROUP BY period_end
           ORDER BY day ASC`,
          [startDate, endDate]
        ),
      ]);

    const stat = stats.rows[0] ?? {
      schools: "0",
      online_sites: "0",
      installed_mwp: "0",
      current_mw: "0",
      period_kwh: "0",
      period_amount: "0",
    };

    const money = Number(collection.rows[0]?.total ?? 0);
    const paid = Number(collection.rows[0]?.paid ?? 0);
    const pending = Number(collection.rows[0]?.pending ?? 0);
    const unbilled = Number(collection.rows[0]?.unbilled ?? 0);

    const revenueData = revenueSeries.rows.map((r) => ({
      date: r.day,
      value: Number(r.revenue),
    }));

    return {
      stats: {
        schools: Number(stat.schools),
        onlineSites: Number(stat.online_sites),
        installedMwp: Number(stat.installed_mwp),
        currentMw: Number(stat.current_mw),
        periodKwh: Number(stat.period_kwh),
        periodAmount: Number(stat.period_amount),
      },
      production: series.rows.map((row) => ({
        date: row.bucket_start,
        value: Number(row.value),
        quality: row.quality,
      })),
      revenue: revenueData,
      rankings: rankings.rows.map((row) => ({
        name: row.site_name,
        productionKwh: Number(row.production_kwh),
      })),
      alerts: alerts.rows,
      collection: {
        total: money,
        paid: paid,
        pending: pending,
        unbilled: unbilled,
        paidPercent:
          money > 0 ? Number(((paid / money) * 100).toFixed(1)) : 0,
      },
      sites: sites.rows.map((row) => ({
        id: row.id,
        name: row.name,
        latitude: row.latitude ? Number(row.latitude) : null,
        longitude: row.longitude ? Number(row.longitude) : null,
        status: row.status,
        capacityMwp: Number(row.capacity_mwp),
        schoolName: row.school_name,
        productionKwh: Number(row.production_kwh),
      })),
    };
  }

  async getProduction(period = "day", month?: number, year?: number) {
    if (period === "day") {
      const result = await this.db.query<{ label: string; value: string; unit: string }>(
        `SELECT lpad(h::text, 2, '0') || ':00' AS label,
                coalesce(round(sum(t.value)::numeric, 2), 0) AS value,
                'MWh' AS unit
         FROM generate_series(0, 23) AS h
         LEFT JOIN telemetry_aggregate t
           ON to_char(t.bucket_start, 'HH24') = lpad(h::text, 2, '0')
           AND t.bucket_start::date = current_date
           AND t.semantic_field = 'total_energy'
           AND t.bucket = 'hour'
         GROUP BY h
         ORDER BY h ASC`
      );
      return result.rows.map((r) => ({
        label: r.label,
        value: Number(r.value),
        unit: r.unit,
      }));
    }

    if (period === "week") {
      const result = await this.db.query<{ label: string; value: string; unit: string }>(
        `SELECT to_char(bucket_start::date, 'DD/MM') AS label,
                round(coalesce(sum(value), 0)::numeric, 2) AS value,
                'MWh' AS unit
         FROM telemetry_aggregate
         WHERE bucket_start >= current_date - interval '7 days' AND semantic_field='total_energy' AND bucket='day'
         GROUP BY bucket_start::date
         ORDER BY bucket_start::date ASC`
      );
      return result.rows.map((r) => ({
        label: r.label,
        value: Number(r.value),
        unit: r.unit,
      }));
    }

    if (period === "year") {
      const targetYear = year ?? new Date().getFullYear();
      const result = await this.db.query<{ label: string; value: string; unit: string }>(
        `SELECT to_char(date_trunc('month', bucket_start), 'Mon') AS label,
                round((coalesce(sum(value), 0) / 1000)::numeric, 2) AS value,
                'GWh' AS unit
         FROM telemetry_aggregate
         WHERE extract(year from bucket_start) = $1 AND semantic_field='total_energy' AND bucket='month'
         GROUP BY date_trunc('month', bucket_start)
         ORDER BY date_trunc('month', bucket_start) ASC`,
        [targetYear]
      );
      return result.rows.map((r) => ({
        label: r.label,
        value: Number(r.value),
        unit: r.unit,
      }));
    }

    // Default: month (31 days)
    const targetMonth = month ?? new Date().getMonth() + 1;
    const targetYear = year ?? new Date().getFullYear();
    const result = await this.db.query<{ label: string; value: string; unit: string }>(
      `SELECT to_char(bucket_start::date, 'DD') AS label,
              round(coalesce(sum(value), 0)::numeric, 2) AS value,
              'MWh' AS unit
       FROM telemetry_aggregate
       WHERE bucket_start >= date_trunc('month', make_date($1, $2, 1))
         AND bucket_start < date_trunc('month', make_date($1, $2, 1)) + interval '1 month'
         AND semantic_field='total_energy'
         AND bucket='day'
       GROUP BY bucket_start::date
       ORDER BY bucket_start::date ASC`,
      [targetYear, targetMonth]
    );
    return result.rows.map((r) => ({
      label: r.label,
      value: Number(r.value),
      unit: r.unit,
    }));
  }

  async getRevenue(period = "month", month?: number, year?: number) {
    if (period === "day") {
      const result = await this.db.query<{ label: string; value: string }>(
        `SELECT to_char(period_end, 'HH24:00') AS label,
                coalesce(sum(amount), 0) AS value
         FROM billing_cycles
         WHERE period_end::date = current_date
         GROUP BY to_char(period_end, 'HH24:00')
         ORDER BY label ASC`
      );
      return result.rows.map((r) => ({
        label: r.label,
        value: Number(r.value),
      }));
    }

    if (period === "week") {
      const result = await this.db.query<{ label: string; value: string }>(
        `SELECT to_char(period_end::date, 'DD/MM') AS label,
                coalesce(sum(amount), 0) AS value
         FROM billing_cycles
         WHERE period_end >= current_date - interval '7 days'
         GROUP BY period_end::date
         ORDER BY period_end::date ASC`
      );
      return result.rows.map((r) => ({
        label: r.label,
        value: Number(r.value),
      }));
    }

    if (period === "multi-year" || period === "multi_year") {
      const result = await this.db.query<{ label: string; value: string }>(
        `SELECT to_char(date_trunc('year', period_end), 'YYYY') AS label,
                coalesce(sum(amount), 0) AS value
         FROM billing_cycles
         GROUP BY date_trunc('year', period_end)
         ORDER BY date_trunc('year', period_end) ASC`
      );
      return result.rows.map((r) => ({
        label: r.label,
        value: Number(r.value),
      }));
    }

    if (period === "year") {
      const targetYear = year ?? new Date().getFullYear();
      const result = await this.db.query<{ label: string; value: string }>(
        `SELECT to_char(date_trunc('month', period_end), 'YYYY-MM') AS label,
                coalesce(sum(amount), 0) AS value
         FROM billing_cycles
         WHERE extract(year from period_end) = $1
         GROUP BY date_trunc('month', period_end)
         ORDER BY date_trunc('month', period_end) ASC`,
        [targetYear]
      );
      return result.rows.map((r) => ({
        label: r.label,
        value: Number(r.value),
      }));
    }

    // Default: month
    const targetMonth = month ?? new Date().getMonth() + 1;
    const targetYear = year ?? new Date().getFullYear();
    const result = await this.db.query<{ label: string; value: string }>(
      `SELECT to_char(period_end::date, 'DD') AS label,
              coalesce(sum(amount), 0) AS value
       FROM billing_cycles
       WHERE period_start >= date_trunc('month', make_date($1, $2, 1))
         AND period_start < date_trunc('month', make_date($1, $2, 1)) + interval '1 month'
       GROUP BY period_end::date
       ORDER BY period_end::date ASC`,
      [targetYear, targetMonth]
    );
    return result.rows.map((r) => ({
      label: r.label,
      value: Number(r.value),
    }));
  }

  async compare(
    metric: string,
    schoolIds: string[] = [],
    _startDate?: string,
    _endDate?: string,
  ): Promise<{ school: string; value: number }[]> {
    const hasFilter = schoolIds.length > 0;
    const filterClause = hasFilter ? "WHERE sc.id = ANY($1)" : "";
    const params: any[] = hasFilter ? [schoolIds] : [];

    switch (metric) {
      case "installedMwp": {
        const sql = `
          SELECT sc.name AS school, coalesce(round(sum(s.capacity_mwp)::numeric, 2), 0) AS value
          FROM schools sc
          LEFT JOIN sites s ON s.school_id = sc.id
          ${filterClause}
          GROUP BY sc.id, sc.name
          ORDER BY value DESC
          LIMIT 10
        `;
        const res = await this.db.query<{ school: string; value: string }>(sql, params);
        return res.rows.map((r) => ({ school: r.school, value: Number(r.value) }));
      }

      case "onlineSites": {
        const sql = `
          SELECT sc.name AS school, count(s.id) FILTER (WHERE s.status = 'online')::int AS value
          FROM schools sc
          LEFT JOIN sites s ON s.school_id = sc.id
          ${filterClause}
          GROUP BY sc.id, sc.name
          ORDER BY value DESC
          LIMIT 10
        `;
        const res = await this.db.query<{ school: string; value: number }>(sql, params);
        return res.rows.map((r) => ({ school: r.school, value: Number(r.value) }));
      }

      case "currentMw": {
        const sql = `
          SELECT sc.name AS school, coalesce(round(sum(t.site_mw)::numeric, 2), 0) AS value
          FROM schools sc
          LEFT JOIN (
            SELECT site_id, greatest(max(normalized_value)-min(normalized_value), 0) * 4 / 1000 AS site_mw
            FROM telemetry_raw
            WHERE semantic_field='total_energy'
              AND source_time >= (SELECT coalesce(max(source_time), now()) FROM telemetry_raw WHERE semantic_field='total_energy') - interval '15 minutes'
            GROUP BY site_id
          ) t ON t.site_id IN (SELECT id FROM sites WHERE school_id = sc.id)
          ${filterClause}
          GROUP BY sc.id, sc.name
          ORDER BY value DESC
          LIMIT 10
        `;
        const res = await this.db.query<{ school: string; value: string }>(sql, params);
        return res.rows.map((r) => ({ school: r.school, value: Number(r.value) }));
      }

      case "periodKwh": {
        const sql = `
          SELECT sc.name AS school, coalesce(round((sum(a.value) / 1000)::numeric, 2), 0) AS value
          FROM schools sc
          LEFT JOIN sites s ON s.school_id = sc.id
          LEFT JOIN telemetry_aggregate a ON a.site_id = s.id AND a.semantic_field = 'total_energy'
          ${filterClause}
          GROUP BY sc.id, sc.name
          ORDER BY value DESC
          LIMIT 10
        `;
        const res = await this.db.query<{ school: string; value: string }>(sql, params);
        return res.rows.map((r) => ({ school: r.school, value: Number(r.value) }));
      }

      case "periodAmount": {
        const sql = `
          SELECT sc.name AS school, coalesce(round((sum(b.amount) / 1000000)::numeric, 2), 0) AS value
          FROM schools sc
          LEFT JOIN sites s ON s.school_id = sc.id
          LEFT JOIN billing_cycles b ON b.site_id = s.id
          ${filterClause}
          GROUP BY sc.id, sc.name
          ORDER BY value DESC
          LIMIT 10
        `;
        const res = await this.db.query<{ school: string; value: string }>(sql, params);
        return res.rows.map((r) => ({ school: r.school, value: Number(r.value) }));
      }

      case "schools":
      default: {
        const sql = `
          SELECT sc.name AS school, count(s.id)::int AS value
          FROM schools sc
          LEFT JOIN sites s ON s.school_id = sc.id
          ${filterClause}
          GROUP BY sc.id, sc.name
          ORDER BY value DESC
          LIMIT 10
        `;
        const res = await this.db.query<{ school: string; value: number }>(sql, params);
        return res.rows.map((r) => ({ school: r.school, value: Number(r.value) }));
      }
    }
  }

  async getPowerFlow(schoolId?: string, siteId?: string) {
    // Fetch all available schools for selector
    const schoolsRes = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM schools ORDER BY name ASC`
    );
    const availableSchools = schoolsRes.rows;

    const isAggregate = (!schoolId || schoolId === "all") && !siteId;

    if (isAggregate) {
      // 1. Real-time active solar power (kW) from latest telemetry_raw
      const solarKwRes = await this.db.query<{ solar_kw: string }>(
        `SELECT coalesce(sum(site_kw), 0)::numeric AS solar_kw
         FROM (
           SELECT site_id, greatest(max(normalized_value) - min(normalized_value), 0) * 4 AS site_kw
           FROM telemetry_raw
           WHERE semantic_field = 'total_energy'
             AND source_time >= (SELECT coalesce(max(source_time), now()) FROM telemetry_raw WHERE semantic_field = 'total_energy') - interval '15 minutes'
           GROUP BY site_id
         ) sub`
      );
      const solarKw = Number(Number(solarKwRes.rows[0]?.solar_kw ?? 0).toFixed(1));

      // 2. Today's cumulative generation (kWh) from telemetry_aggregate
      const todayGenRes = await this.db.query<{ total: string }>(
        `SELECT coalesce(sum(value), 0)::numeric AS total
         FROM telemetry_aggregate
         WHERE semantic_field = 'total_energy'
           AND bucket = 'hour'
           AND bucket_start >= current_date`
      );
      let todayGenKwh = Number(Number(todayGenRes.rows[0]?.total ?? 0).toFixed(1));
      if (todayGenKwh === 0) {
        const delta15mRes = await this.db.query<{ total: string }>(
          `SELECT coalesce(sum(prod), 0)::numeric AS total
           FROM (
             SELECT greatest(max(value) - min(value), 0) AS prod
             FROM telemetry_aggregate
             WHERE semantic_field = 'total_energy'
               AND bucket = '15m'
               AND bucket_start >= current_date
             GROUP BY site_id
           ) t`
        );
        todayGenKwh = Number(Number(delta15mRes.rows[0]?.total ?? 0).toFixed(1));
      }

      // 3. Today's cumulative export (kWh) from telemetry_aggregate (energy_export_kwh)
      const exportRes = await this.db.query<{ total: string }>(
        `SELECT coalesce(sum(value), 0)::numeric AS total
         FROM telemetry_aggregate
         WHERE semantic_field = 'energy_export_kwh'
           AND bucket = 'hour'
           AND bucket_start >= current_date`
      );
      let totalExportKwh = Number(Number(exportRes.rows[0]?.total ?? 0).toFixed(1));
      if (totalExportKwh === 0 && todayGenKwh > 0) {
        const deltaExp15m = await this.db.query<{ total: string }>(
          `SELECT coalesce(sum(prod), 0)::numeric AS total
           FROM (
             SELECT greatest(max(value) - min(value), 0) AS prod
             FROM telemetry_aggregate
             WHERE semantic_field = 'energy_export_kwh'
               AND bucket = '15m'
               AND bucket_start >= current_date
             GROUP BY site_id
           ) t`
        );
        totalExportKwh = Number(Number(deltaExp15m.rows[0]?.total ?? 0).toFixed(1));
      }

      // 4. Total consumed energy (kWh) & import (kWh)
      const consumedFromSolar = Math.max(0, todayGenKwh - totalExportKwh);
      const totalConsumedKwh = Number((consumedFromSolar * 1.25).toFixed(1));
      const totalImportKwh = Number(Math.max(0, totalConsumedKwh - consumedFromSolar).toFixed(1));

      // 5. Real-time active power balance (kW)
      let solarToSchoolKw = 0;
      let gridExportKw = 0;
      let schoolLoadKw = 0;
      let gridImportKw = 0;

      if (solarKw > 0) {
        const exportRatio = todayGenKwh > 0 ? Math.min(0.5, totalExportKwh / todayGenKwh) : 0.35;
        gridExportKw = Number((solarKw * exportRatio).toFixed(1));
        solarToSchoolKw = Number(Math.max(0, solarKw - gridExportKw).toFixed(1));
        schoolLoadKw = solarToSchoolKw;
        gridImportKw = 0.0;
      } else {
        solarToSchoolKw = 0.0;
        gridExportKw = 0.0;
        schoolLoadKw = 14.2;
        gridImportKw = 14.2;
      }

      const solarToSchoolPercent = solarKw > 0 ? Math.round((solarToSchoolKw / solarKw) * 100) : 0;
      const gridExportPercent = solarKw > 0 ? Math.max(0, 100 - solarToSchoolPercent) : 0;

      // 6. Rate from rate_versions
      const rateRes = await this.db.query<{ rate: string }>(
        `SELECT coalesce(avg(rate), 4.25)::numeric AS rate
         FROM rate_versions
         WHERE effective_to IS NULL OR effective_to >= current_date`
      );
      const rate = Number(rateRes.rows[0]?.rate ?? 4.25);
      const todayRevenueThb = Number((todayGenKwh * rate).toFixed(2));
      const todayCo2ReductionKg = Number((todayGenKwh * 0.4999).toFixed(2));

      // 7. Global alert severity
      const alertRes = await this.db.query(
        `SELECT severity FROM alerts WHERE status = 'open' LIMIT 5`
      );
      let equipmentHealth: "normal" | "warning" | "critical" = "normal";
      if (alertRes.rows.some((a) => a.severity === "critical")) {
        equipmentHealth = "critical";
      } else if (alertRes.rows.length > 0) {
        equipmentHealth = "warning";
      }

      // 8. Latest timestamp
      const timeRes = await this.db.query<{ latest: string }>(
        `SELECT coalesce(max(source_time), now())::text AS latest FROM telemetry_raw`
      );
      const timestamp = timeRes.rows[0]?.latest || new Date().toISOString();

      return {
        isAggregate: true,
        siteId: undefined,
        siteName: `ระบบภาพรวมทั้งหมด (${availableSchools.length} โรงเรียน)`,
        schoolId: "all",
        schoolName: "ภาพรวมระบบทั้งหมด",
        timestamp,
        solarKw,
        schoolLoadKw,
        solarToSchoolKw,
        solarToSchoolPercent,
        gridExportKw,
        gridExportPercent,
        gridImportKw,
        todaySummary: {
          solarGenerationKwh: todayGenKwh,
          totalConsumedKwh,
          totalExportKwh,
          totalImportKwh,
          solarRevenueThb: todayRevenueThb,
          co2ReductionKg: todayCo2ReductionKg,
          equipmentHealth,
        },
        availableSchools,
      };
    }

    // Single school or site
    let siteQuery = `
      SELECT s.id, s.name, s.capacity_mwp, s.status, sc.id AS school_id, sc.name AS school_name
      FROM sites s
      JOIN schools sc ON sc.id = s.school_id
    `;
    const params: any[] = [];
    if (siteId) {
      siteQuery += ` WHERE s.id = $1`;
      params.push(siteId);
    } else if (schoolId && schoolId !== "all") {
      siteQuery += ` WHERE sc.id = $1`;
      params.push(schoolId);
    }
    siteQuery += ` ORDER BY s.created_at ASC LIMIT 1`;

    const siteRes = await this.db.query(siteQuery, params);
    const site = siteRes.rows[0];

    const targetSiteId = site?.id;
    const targetSchoolId = site?.school_id;
    const schoolName = site?.school_name || "โรงเรียน";
    const siteName = site?.name || "Solar Rooftop System";

    // 1. Real-time active solar power (kW) for this site
    const solarKwRes = await this.db.query<{ solar_kw: string }>(
      `SELECT coalesce(sum(site_kw), 0)::numeric AS solar_kw
       FROM (
         SELECT r.site_id, greatest(max(r.normalized_value) - min(r.normalized_value), 0) * 4 AS site_kw
         FROM telemetry_raw r
         WHERE r.site_id = $1 AND r.semantic_field = 'total_energy'
           AND r.source_time >= (SELECT coalesce(max(source_time), now()) FROM telemetry_raw WHERE semantic_field = 'total_energy') - interval '15 minutes'
         GROUP BY r.site_id
       ) sub`,
      [targetSiteId]
    );
    const solarKw = Number(Number(solarKwRes.rows[0]?.solar_kw ?? 0).toFixed(1));

    // 2. Today's cumulative generation (kWh) for this site
    const todayGenRes = await this.db.query<{ total: string }>(
      `SELECT coalesce(sum(value), 0)::numeric AS total
       FROM telemetry_aggregate
       WHERE site_id = $1 AND semantic_field = 'total_energy'
         AND bucket = 'hour'
         AND bucket_start >= current_date`,
      [targetSiteId]
    );
    let todayGenKwh = Number(Number(todayGenRes.rows[0]?.total ?? 0).toFixed(1));
    if (todayGenKwh === 0) {
      const delta15mRes = await this.db.query<{ total: string }>(
        `SELECT coalesce(greatest(max(value) - min(value), 0), 0)::numeric AS total
         FROM telemetry_aggregate
         WHERE site_id = $1 AND semantic_field = 'total_energy'
           AND bucket = '15m'
           AND bucket_start >= current_date`,
        [targetSiteId]
      );
      todayGenKwh = Number(Number(delta15mRes.rows[0]?.total ?? 0).toFixed(1));
    }

    // 3. Today's export (kWh)
    const exportRes = await this.db.query<{ total: string }>(
      `SELECT coalesce(sum(value), 0)::numeric AS total
       FROM telemetry_aggregate
       WHERE site_id = $1 AND semantic_field = 'energy_export_kwh'
         AND bucket = 'hour'
         AND bucket_start >= current_date`,
      [targetSiteId]
    );
    let totalExportKwh = Number(Number(exportRes.rows[0]?.total ?? 0).toFixed(1));

    // 4. Power balance
    const consumedFromSolar = Math.max(0, todayGenKwh - totalExportKwh);
    const totalConsumedKwh = Number((consumedFromSolar * 1.25).toFixed(1));
    const totalImportKwh = Number(Math.max(0, totalConsumedKwh - consumedFromSolar).toFixed(1));

    let solarToSchoolKw = 0;
    let gridExportKw = 0;
    let schoolLoadKw = 0;
    let gridImportKw = 0;

    if (solarKw > 0) {
      const exportRatio = todayGenKwh > 0 ? Math.min(0.5, totalExportKwh / todayGenKwh) : 0.35;
      gridExportKw = Number((solarKw * exportRatio).toFixed(1));
      solarToSchoolKw = Number(Math.max(0, solarKw - gridExportKw).toFixed(1));
      schoolLoadKw = solarToSchoolKw;
      gridImportKw = 0.0;
    } else {
      solarToSchoolKw = 0.0;
      gridExportKw = 0.0;
      schoolLoadKw = 3.5;
      gridImportKw = 3.5;
    }

    const solarToSchoolPercent = solarKw > 0 ? Math.round((solarToSchoolKw / solarKw) * 100) : 0;
    const gridExportPercent = solarKw > 0 ? Math.max(0, 100 - solarToSchoolPercent) : 0;

    // 5. Rate
    const rateRes = await this.db.query<{ rate: string }>(
      `SELECT coalesce(r.rate, 4.25)::numeric AS rate
       FROM rate_versions r
       JOIN contracts c ON c.id = r.contract_id
       WHERE c.site_id = $1 AND (r.effective_to IS NULL OR r.effective_to >= current_date)
       LIMIT 1`,
      [targetSiteId]
    );
    const rate = Number(rateRes.rows[0]?.rate ?? 4.25);
    const todayRevenueThb = Number((todayGenKwh * rate).toFixed(2));
    const todayCo2ReductionKg = Number((todayGenKwh * 0.4999).toFixed(2));

    // 6. Alerts
    let equipmentHealth: "normal" | "warning" | "critical" = "normal";
    if (targetSiteId) {
      const alertRes = await this.db.query(
        `SELECT severity FROM alerts WHERE site_id = $1 AND status = 'open' LIMIT 5`,
        [targetSiteId]
      );
      if (alertRes.rows.some((a) => a.severity === "critical")) {
        equipmentHealth = "critical";
      } else if (alertRes.rows.length > 0) {
        equipmentHealth = "warning";
      }
    }

    // 7. Timestamp
    const timeRes = await this.db.query<{ latest: string }>(
      `SELECT coalesce(max(source_time), now())::text AS latest FROM telemetry_raw WHERE site_id = $1`,
      [targetSiteId]
    );
    const timestamp = timeRes.rows[0]?.latest || new Date().toISOString();

    return {
      isAggregate: false,
      siteId: targetSiteId,
      siteName,
      schoolId: targetSchoolId,
      schoolName,
      timestamp,
      solarKw,
      schoolLoadKw,
      solarToSchoolKw,
      solarToSchoolPercent,
      gridExportKw,
      gridExportPercent,
      gridImportKw,
      todaySummary: {
        solarGenerationKwh: todayGenKwh,
        totalConsumedKwh,
        totalExportKwh,
        totalImportKwh,
        solarRevenueThb: todayRevenueThb,
        co2ReductionKg: todayCo2ReductionKg,
        equipmentHealth,
      },
      availableSchools,
    };
  }
}
