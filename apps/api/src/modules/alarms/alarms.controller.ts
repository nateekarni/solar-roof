import { Controller, Inject, Put, Req, Param, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { schoolScope } from "../../common/auth/resource-scope.js";

@Controller("v1/alerts")
export class AlarmsController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Put(":id/acknowledge")
  async acknowledge(@Param("id") id:string,@Req() req:any) {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new NotFoundException('Alert not found');
    const result=await this.db.query("UPDATE alerts a SET status='acknowledged' FROM sites s WHERE s.id=a.site_id AND a.id=$1::uuid AND a.status IN ('open','acknowledged') AND ($2::uuid[] IS NULL OR s.school_id=ANY($2::uuid[])) RETURNING a.id",[id,schoolScope(req.user)]);
    if(!result.rows[0])throw new NotFoundException('Alert not found');
    return {success:true};
  }

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
