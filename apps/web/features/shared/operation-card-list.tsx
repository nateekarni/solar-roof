"use client";
import * as React from 'react';
import type {OperationRow} from '@solar/api-contracts';
import {FileQuestion,Image as ImageIcon} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {Card} from '../../components/ui/card';
import {operationKeys,isTemporalColumn} from './operation-columns';
import {TelemetryAgeLabel} from './telemetry-age-label';
import {renderStatusBadge,STATUS_MAP} from '../../lib/status-badge';
import {formatAppDate,formatAppDateTime,isIsoDateLike} from '../../lib/date-format';
import {useLocale} from '../../providers/locale-provider';
export interface OperationCardListProps {
 resource:string;title:string;columns:string[];rows:OperationRow[];idKey?:string;pageSize?:number;serverManaged?:boolean;
 onOpenDetail?:(row:OperationRow)=>void;renderActions?:(row:OperationRow)=>React.ReactNode;onOpenSlip?:(url:string)=>void;
}
export function OperationCardList({resource,columns:rawColumns,rows,idKey='id',onOpenDetail,renderActions,onOpenSlip}:OperationCardListProps) {
 const locale=useLocale();
 const keys=rows[0]?operationKeys(resource,rows[0],idKey):[];
 const titleKey=keys[0]||'title',statusKey=keys.find(k=>k.includes('status')||k.includes('severity'));
 const secondaryKeys=keys.filter(k=>k!==titleKey&&k!==statusKey);
 const formatNumber=(value:unknown)=>value===null||value===undefined||value===""?"—":Number.isFinite(Number(value))?new Intl.NumberFormat(locale==='th'?'th-TH':'en-US',{maximumFractionDigits:2}).format(Number(value)):String(value??'—');
 const isStatusValue=(value:unknown)=>Boolean(STATUS_MAP[String(value??'').trim().toLowerCase()]||STATUS_MAP[String(value??'').trim()]);
 const getStatusBadge=(value:string)=>renderStatusBadge(value,locale);
 return <div className="space-y-3">
      {/* Cards List */}
      {rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center bg-card border-border/80 rounded-xl">
          <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground mb-2">
            <FileQuestion className="size-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {locale === "th" ? "ไม่พบข้อมูล" : "No data found"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === "th" ? "ยังไม่มีรายการในขณะนี้" : "No records available at this time"}
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row, idx) => {
            const rawTitleVal = row[titleKey];
            const titleDisplay = String(rawTitleVal ?? "-");
            const statusVal = statusKey ? row[statusKey] : null;

            return (
              <Card
                key={String(row[idKey] ?? idx)}
                className={`p-3.5 bg-card border-border/80 shadow-2xs rounded-xl space-y-2.5 hover:border-primary/40 transition-colors ${
                  onOpenDetail ? "cursor-pointer active:scale-[0.99] transition-transform" : ""
                }`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("button, a, input")) return;
                  if (onOpenDetail) {
                    onOpenDetail(row);
                  }
                }}
              >
                {/* Card Header: Title + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                      {rawColumns[0] ?? titleKey}
                    </p>
                    <h3 className="text-sm font-bold text-foreground truncate mt-0.5">
                      {titleDisplay}
                    </h3>
                  </div>

                  {statusVal !== null && statusVal !== undefined && (
                    <div className="shrink-0">
                      {getStatusBadge(String(statusVal))}
                    </div>
                  )}
                </div>

                {/* Card Body: Secondary Details */}
                {secondaryKeys.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                    {(resource === "sites" ? secondaryKeys.filter(k=>k!=="lastSeenAt") : (["billing","contracts","documents","receipts"].includes(resource) ? secondaryKeys : secondaryKeys.slice(0,4))).map((key, kIdx) => {
                      const colHeader = rawColumns[keys.indexOf(key)] ?? key;
                      const val = row[key];
                      const str = String(val ?? "-");

                      const isAmount =
                        key.toLowerCase().includes("amount") ||
                        key.toLowerCase().includes("ยอด") ||
                        key.toLowerCase().includes("price") ||
                        key.toLowerCase().includes("revenue");

                      const isEnergy =
                        key.toLowerCase().includes("kwh") ||
                        key.toLowerCase().includes("mwp") ||
                        key.toLowerCase().includes("power") ||
                        key.toLowerCase().includes("capacity");

                      const isSlip =
                        key.toLowerCase().includes("slip") ||
                        key === "หลักฐานการชำระ";

                      return (
                        <div key={key} className="space-y-0.5 min-w-0">
                          <span className="text-[10px] text-muted-foreground font-medium block truncate">
                            {colHeader}
                          </span>
                          {isSlip && str && str !== "-" && str !== "null" && str !== "undefined" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="min-h-11 h-auto text-[11px] px-2 gap-1 text-primary border-primary/30 hover:bg-primary/5 cursor-pointer font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenSlip?.(str);
                              }}
                            >
                              <ImageIcon className="size-3" />
                              <span>{locale === "th" ? "ดูสลิป" : "View Slip"}</span>
                            </Button>
                          ) : (
                            <span className={`block truncate ${
                              isAmount
                                ? "font-semibold text-primary"
                                : isEnergy
                                ? "font-semibold text-foreground"
                                : isStatusValue(val)
                                ? ""
                                : "text-foreground"
                            }`}>
                              {resource === "sites" && ["lastUpdated","lastSeenAt","last_seen_at"].includes(key) ? (
                                <TelemetryAgeLabel value={val} locale={locale} compact />
                              ) : isStatusValue(val) ? (
                                getStatusBadge(str)
                              ) : isAmount ? (
                                `฿${formatNumber(val)}`
                              ) : isEnergy ? (
                                formatNumber(val)
                              ) : (isTemporalColumn(key) || isIsoDateLike(str)) && str && str !== "-" ? (
                                str.includes(":") || str.includes("T") ? formatAppDateTime(str, locale) : formatAppDate(str, locale)
                              ) : (
                                str
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">{renderActions?.(row)}</div>
              </Card>
            );
          })}
        </div>
      )}

</div>;
}
