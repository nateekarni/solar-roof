import { BadRequestException, Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";

@Controller("v1")
export class AssetsController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get("schools")
  async listSchools() {
    const res = await this.db.query("SELECT id, name, code, region, status FROM schools ORDER BY name");
    return res.rows;
  }

  @Post("schools")
  async createSchool(@Body() body: { name?: string; region?: string }) {
    const name = body.name?.trim();
    const region = body.region?.trim() || "ภาคกลาง";
    if (!name) {
      throw new BadRequestException("School name is required");
    }

    const countRes = await this.db.query("SELECT count(*)::int AS count FROM schools");
    const count = countRes.rows[0]?.count ?? 0;
    const code = `SCH-${String(count + 1).padStart(3, "0")}`;
    const id = randomUUID();

    const sql = `
      INSERT INTO schools (id, name, code, region, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING id, name, code, region, status
    `;
    const res = await this.db.query(sql, [id, name, code, region]);
    return res.rows[0];
  }

  @Get("sites")
  async listSites() {
    const res = await this.db.query("SELECT id, school_id AS \"schoolId\", name, capacity_mwp AS \"capacityMwp\", status FROM sites ORDER BY name");
    return res.rows;
  }

  @Post("sites")
  async createSite(@Body() body: {
    name?: string;
    schoolId?: string;
    capacityMwp?: number;
    latitude?: number;
    longitude?: number;
  }) {
    const name = body.name?.trim();
    const schoolId = body.schoolId;
    const capacityMwp = Number(body.capacityMwp ?? 0.5);
    const lat = body.latitude ? Number(body.latitude) : 13.7563;
    const lng = body.longitude ? Number(body.longitude) : 100.5018;

    if (!name || !schoolId) {
      throw new BadRequestException("Site name and schoolId are required");
    }

    const siteId = randomUUID();
    const siteSql = `
      INSERT INTO sites (id, school_id, name, capacity_mwp, latitude, longitude, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'online')
      RETURNING id, school_id AS "schoolId", name, capacity_mwp AS "capacityMwp", status
    `;
    const res = await this.db.query(siteSql, [siteId, schoolId, name, capacityMwp, lat, lng]);

    // Create default gateway for site
    const countRes = await this.db.query("SELECT count(*)::int AS count FROM gateways");
    const gwCount = countRes.rows[0]?.count ?? 0;
    const gwId = randomUUID();
    const gwName = `GW-${String(gwCount + 1).padStart(3, "0")}`;
    const endpoint = `energy/site-${siteId.slice(0, 8)}/telemetry`;

    await this.db.query(
      `INSERT INTO gateways (id, site_id, name, protocol, endpoint, status) VALUES ($1, $2, $3, 'mqtt', $4, 'online')`,
      [gwId, siteId, gwName, endpoint]
    );

    return res.rows[0];
  }
}
