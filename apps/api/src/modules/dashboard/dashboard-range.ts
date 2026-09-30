export type DashboardQuery = Record<string, string | undefined>;
/** Calendar dates are interpreted in Asia/Bangkok; the end date is inclusive. */
export function dashboardRange(query: DashboardQuery, now = new Date()): {start:string;end:string} {
  if (['year','multi-year','multi_year'].includes(query.period || '')) throw new Error('Annual selection is disabled');
  let start = query.start_date;
  let end = query.end_date;
  if (Boolean(start) !== Boolean(end)) throw new Error('Both start_date and end_date are required');
  if (!start && !end) {
    const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const year = query.year ? Number(query.year) : local.getUTCFullYear();
    const month = query.month ? Number(query.month) : local.getUTCMonth()+1;
    if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid month/year');
    const date = new Date(Date.UTC(year, month-1, 1));
    start = date.toISOString().slice(0,10);
    end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0,10);
    if (query.period === 'day' || query.period === 'week') {
      end = local.toISOString().slice(0,10);
      start = query.period === 'day' ? end : new Date(Date.parse(end) - 6*86400000).toISOString().slice(0,10);
    }
  }
  for (const value of [start!,end!]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('Invalid calendar date');
  }
  if (start! > end!) throw new Error('End date must not be before start date');
  const a = new Date(start!); const b = new Date(end!);
  if ((b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth() > 2) throw new Error('Select at most 3 calendar months');
  return {start:start!,end:end!};
}
