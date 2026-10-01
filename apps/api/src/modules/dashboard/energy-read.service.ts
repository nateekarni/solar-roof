import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
export interface DailyEnergy {siteId:string;day:string;kwh:number|null;quality:string;watermark:string|null;refreshedAt:string|null;reason:string|null}
@Injectable()
export class EnergyReadService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService) {}
 async daily(siteIds:string[],from:string,to:string):Promise<DailyEnergy[]> {
  if (!siteIds.length) return [];
  const days=(Date.parse(to)-Date.parse(from))/86400000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isInteger(days) || days<0 || days>366 || siteIds.length>1000) throw new Error('Invalid bounded energy range');
  const result=await this.db.query<{site_id:string;day:string;kwh:string|null;quality:string;watermark:string|null;refreshed_at:string|null;reason:string|null}>(`
   WITH expected AS (
    SELECT DISTINCT bm.site_id,bm.device_id,day::date AS day FROM billing_meters bm
    CROSS JOIN generate_series($2::date::timestamp,$3::date::timestamp,interval '1 day') day
    WHERE bm.site_id=ANY($1::uuid[]) AND bm.active AND bm.semantic_field='total_energy'
   ) SELECT e.site_id,e.day::text,
    CASE WHEN count(*) FILTER(WHERE d.device_id IS NULL OR dirty.device_id IS NOT NULL OR d.quality NOT IN ('complete','partial') OR (d.quality='partial' AND e.day<(now() AT TIME ZONE 'Asia/Bangkok')::date))=0 THEN sum(d.kwh)::text ELSE NULL END kwh,
    CASE WHEN bool_or(d.device_id IS NULL OR dirty.device_id IS NOT NULL) THEN 'preparing'
     WHEN bool_or(d.quality='reset') THEN 'reset' WHEN bool_or(d.quality='missing' OR (d.quality='partial' AND e.day<(now() AT TIME ZONE 'Asia/Bangkok')::date)) THEN 'missing' WHEN bool_or(d.quality='partial') THEN 'partial' ELSE 'complete' END quality,
    string_agg(DISTINCT d.reason,',') reason,
    min(d.closing_at)::text watermark,min(d.refreshed_at)::text refreshed_at
    FROM expected e LEFT JOIN energy_daily d ON d.device_id=e.device_id AND d.site_id=e.site_id AND d.day=e.day
    LEFT JOIN energy_dirty_days dirty ON dirty.device_id=e.device_id AND dirty.day=e.day
    GROUP BY e.site_id,e.day ORDER BY e.day,e.site_id`,[siteIds,from,to]);
  return result.rows.map(r=>({siteId:r.site_id,day:r.day,kwh:r.kwh===null?null:Number(r.kwh),quality:r.quality,watermark:r.watermark,refreshedAt:r.refreshed_at,reason:r.reason}));
 }
}
