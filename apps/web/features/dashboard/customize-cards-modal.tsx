"use client";

import * as React from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useLocale, useT } from "../../providers/locale-provider";

export interface MetricOption {
  key: string;
  label: string;
}

export function CustomizeCardsModal({
  open,
  onOpenChange,
  currentConfig,
  onSave,
  availableMetrics,
  defaultConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfig: string[];
  onSave: (newConfig: string[]) => void;
  availableMetrics: MetricOption[];
  defaultConfig: string[];
}) {
  const t = useT();
  const locale = useLocale();
  const [draftConfig, setDraftConfig] = React.useState<string[]>(currentConfig);

  React.useEffect(() => {
    if (open) {
      setDraftConfig(currentConfig);
    }
  }, [open, currentConfig]);

  const handleChange = (index: number, metricKey: string) => {
    setDraftConfig((prev) => {
      const next = [...prev];
      next[index] = metricKey;
      return next;
    });
  };

  const handleReset = () => {
    setDraftConfig(defaultConfig);
  };

  const handleConfirm = () => {
    onSave(draftConfig);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "ปรับแต่งการ์ดสรุปภาพรวม" : "Customize Summary Cards"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? `เลือกหัวข้อตัวชี้วัดที่ต้องการให้แสดงในแต่ละการ์ด (ตำแหน่ง 1 - ${defaultConfig.length})`
                  : `Choose which metric to display on each summary card (Position 1 - ${defaultConfig.length})`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 py-3">
          {Array.from({ length: defaultConfig.length }).map((_, idx) => (
            <div key={idx} className="space-y-2 border-t pt-4">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>{locale === "th" ? `การ์ดที่ ${idx + 1}` : `Card #${idx + 1}`}</span>
              </Label>
              <Select
                value={draftConfig[idx] ?? defaultConfig[idx] ?? "totalSites"}
                onValueChange={(val) => handleChange(idx, val)}
              >
                <SelectTrigger className="h-10 text-xs bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMetrics.map((metric) => (
                    <SelectItem key={metric.key} value={metric.key} className="text-xs">
                      {metric.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs h-10 px-3 text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            <span>{locale === "th" ? "คืนค่าเริ่มต้น" : "Reset Defaults"}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-10 px-4"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              className="text-xs h-10 px-5 font-semibold"
            >
              {t("common.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
