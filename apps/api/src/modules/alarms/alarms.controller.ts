import { Controller, Inject, Put } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

@Controller("v1/alerts")
export class AlarmsController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Put("acknowledge-all")
  async acknowledgeAll() {
    const res = await this.db.query("UPDATE alerts SET status = 'acknowledged' WHERE status != 'acknowledged' RETURNING id");
    return {
      success: true,
      acknowledgedCount: res.rowCount ?? 0,
      message: `รับทราบการแจ้งเตือนทั้งหมด ${res.rowCount ?? 0} รายการเรียบร้อยแล้ว`,
    };
  }
}
