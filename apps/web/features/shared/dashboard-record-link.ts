export type DashboardRecordScope={siteId?:string|undefined;start:string;end:string};
export function dashboardRecordHref(id:string,scope:DashboardRecordScope){
 const params=new URLSearchParams({start_date:scope.start,end_date:scope.end});
 if(scope.siteId)params.set('site_id',scope.siteId);
 return `/records/billing/${encodeURIComponent(id)}?${new URLSearchParams({dashboard:params.toString()})}`;
}
/** Origin hints control navigation only; the dashboard always authorizes its own data. */
export function dashboardReturnHref(value:string|null):string|null{
 if(!value)return null;
 const input=new URLSearchParams(value),start=input.get('start_date'),end=input.get('end_date');
 const valid=(day:string|null):day is string=>Boolean(day&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day);
 if(!valid(start)||!valid(end)||start>end)return null;
 const params=new URLSearchParams({start_date:start,end_date:end}),site=input.get('site_id');
 if(site)params.set('site_id',site);
 return '/?'+params;
}
