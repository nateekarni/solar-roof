import { BadRequestException } from '@nestjs/common';
export function siteHistoryFilter(siteId:string,query:{search?:string;start?:string;end?:string;page?:string}) {
 const values: string[]=[siteId];const clauses=['ps.site_id=$1'];
 const date=(value:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(new Date(value).getTime())||new Date(value).toISOString().slice(0,10)!==value)throw new BadRequestException('Invalid calendar date');
  return value+'T00:00:00+07:00';
 };
 if(query.search?.trim()){values.push('%'+query.search.trim().slice(0,200)+'%');clauses.push(`(ps.tag ILIKE $${values.length} OR d.name ILIKE $${values.length} OR ps.source_message_id ILIKE $${values.length})`);}
 if(query.start){values.push(date(query.start));clauses.push(`ps.received_at >= $${values.length}::timestamptz`);}
 if(query.end){values.push(date(query.end));clauses.push(`ps.received_at < $${values.length}::timestamptz + interval '1 day'`);}
 if(query.start&&query.end&&query.start>query.end)throw new BadRequestException('End date precedes start date');
 const page=Number(query.page??1);if(!Number.isSafeInteger(page)||page<1||page>1000000)throw new BadRequestException('Invalid page');
 return {values,where:clauses.join(' AND '),page,offset:(page-1)*50,pageSize:50};
}
