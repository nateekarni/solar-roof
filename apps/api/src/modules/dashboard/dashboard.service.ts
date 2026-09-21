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
        `SELECT to_char(bucket_start, 'HH24:00') AS label,
                round(coalesce(sum(value), 0)::numeric, 2) AS value,
                'MWh' AS unit
         FROM telemetry_aggregate
         WHERE bucket_start::date = current_date AND semantic_field='total_energy'
         GROUP BY to_char(bucket_start, 'HH24:00')
         ORDER BY label ASC`
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
         WHERE bucket_start >= current_date - interval '7 days' AND semantic_field='total_energy'
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
         WHERE extract(year from bucket_start) = $1 AND semantic_field='total_energy'
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

    if (period === "year") {
      const targetYear = year ?? new Date().getFullYear();
      const result = await this.db.query<{ label: string; value: string }>(
        `SELECT to_char(date_trunc('month', period_end), 'Mon') AS label,
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
          SELECT sc.name AS school, coalesce(round(sum(s.capacity_mwp * 0.75)::numeric, 2), 0) AS value
          FROM schools sc
          LEFT JOIN sites s ON s.school_id = sc.id AND s.status = 'online'
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
}
