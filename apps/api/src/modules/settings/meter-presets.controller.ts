import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Put } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { Roles } from "../../common/roles.decorator.js";

@Controller("v1/meter-presets")
export class MeterPresetsController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async listPresets() {
    const res = await this.db.query(
      "SELECT id, brand, model, device_type AS \"deviceType\", registers, created_at AS \"createdAt\" FROM meter_presets ORDER BY brand, model"
    );
    return res.rows;
  }

  @Get(":id")
  async getPreset(@Param("id") id: string) {
    const res = await this.db.query(
      "SELECT id, brand, model, device_type AS \"deviceType\", registers, created_at AS \"createdAt\" FROM meter_presets WHERE id = $1",
      [id]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException("Meter preset not found");
    }
    return res.rows[0];
  }

  @Roles("owner", "admin")
  @Post()
  async createPreset(@Body() body: {
    brand?: string;
    model?: string;
    deviceType?: string;
    registers?: any[];
  }) {
    const brand = body.brand?.trim();
    const model = body.model?.trim();
    const deviceType = body.deviceType || "meter";
    const registers = JSON.stringify(body.registers || []);

    if (!brand || !model) {
      throw new BadRequestException("brand and model are required");
    }

    const id = randomUUID();
    const sql = `
      INSERT INTO meter_presets (id, brand, model, device_type, registers, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
      RETURNING id, brand, model, device_type AS "deviceType", registers, created_at AS "createdAt"
    `;

    try {
      const res = await this.db.query(sql, [id, brand, model, deviceType, registers]);
      return res.rows[0];
    } catch (err: any) {
      if (err.code === "23505") {
        throw new BadRequestException(`Preset for ${brand} ${model} already exists`);
      }
      throw err;
    }
  }

  @Roles("owner", "admin")
  @Put(":id")
  async updatePreset(
    @Param("id") id: string,
    @Body() body: {
      brand?: string;
      model?: string;
      deviceType?: string;
      registers?: any[];
    }
  ) {
    const brand = body.brand?.trim();
    const model = body.model?.trim();
    const deviceType = body.deviceType || "meter";
    const registers = JSON.stringify(body.registers || []);

    if (!brand || !model) {
      throw new BadRequestException("brand and model are required");
    }

    const sql = `
      UPDATE meter_presets
      SET brand = $1, model = $2, device_type = $3, registers = $4::jsonb, updated_at = NOW()
      WHERE id = $5
      RETURNING id, brand, model, device_type AS "deviceType", registers, updated_at AS "updatedAt"
    `;
    const res = await this.db.query(sql, [brand, model, deviceType, registers, id]);
    if (res.rows.length === 0) {
      throw new NotFoundException("Meter preset not found");
    }
    return res.rows[0];
  }

  @Roles("owner")
  @Delete(":id")
  async deletePreset(@Param("id") id: string) {
    const res = await this.db.query("DELETE FROM meter_presets WHERE id = $1 RETURNING id", [id]);
    if (res.rows.length === 0) {
      throw new NotFoundException("Meter preset not found");
    }
    return { success: true, id };
  }
}
