"use client";

import { Card, CardContent } from "../../components/ui/card";
import { Award } from "lucide-react";
import { useLocale } from "../../providers/locale-provider";

type SiteRanking = { name: string; productionKwh: number };

export function RankingChart({ sites }: { sites?: SiteRanking[] }) {
  const th = useLocale() === "th";
  const rankingList = sites && sites.length > 0 ? sites.slice(0, 4) : [];

  const formatMWh = (kwh: number) => (kwh / 1000).toFixed(2);

  return (
    <Card className="panel bg-card">
      <CardContent className="p-0">
        <div className="mb-2.5">
          <h3 className="text-xs font-bold text-foreground">
            {th ? "ไซต์ที่ผลิตไฟฟ้าได้สูงสุดในช่วงเวลาที่เลือก" : "Top producing sites for the selected period"}
            {rankingList.length > 0 && (
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                {th ? "(4 อันดับแรก)" : "(Top 4)"}
              </span>
            )}
          </h3>
        </div>

        {rankingList.length === 0 ? (
          <div className="flex h-20 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground">
            <Award className="size-4 text-muted-foreground/50" />
            <span>{th ? "ยังไม่มีข้อมูลการผลิตในช่วงเวลาที่เลือก" : "No production data for the selected period"}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
            {rankingList.map((site, index) => (
              <div
                key={`${site.name}-${index}`}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 shadow-xs transition-colors hover:bg-muted/40"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-foreground">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {site.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-xs font-bold text-foreground">
                    {formatMWh(site.productionKwh)}{" "}
                  </span>
                  <span className="text-[10px] text-muted-foreground">MWh</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
