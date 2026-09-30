import { Controller, Inject, Put, Req } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { schoolScope } from "../../common/auth/resource-scope.js";

@Controller("v1/alerts")
export class AlarmsController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Put("acknowledge-all")
  async acknowledgeAll(@Req() req:any) {
    const res = await this.db.query("UPDATE alerts a SET status = 'acknowledged' FROM sites s WHERE s.id=a.site_id AND a.status='open' AND ($1::uuid[] IS NULL OR s.school_id=ANY($1::uuid[])) RETURNING a.id",[schoolScope(req.user)]);
    return {
      success: true,
      acknowledgedCount: res.rowCount ?? 0,
      message: `รับทราบการแจ้งเตือนทั้งหมด ${res.rowCount ?? 0} รายการเรียบร้อยแล้ว`,
    };
  }
}
