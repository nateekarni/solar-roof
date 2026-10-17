"use client";

import * as React from "react";
import { Copy, Check, FileCode, GitCompare, Minus, Plus, History } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

export interface AuditDiffViewerProps {
  before?: unknown;
  after?: unknown;
  locale?: "th" | "en";
}

type DiffItem = {
  key: string;
  type: "added" | "removed" | "changed" | "unchanged";
  beforeValue?: unknown;
  afterValue?: unknown;
};

function parseJsonSafe(val: unknown): Record<string, unknown> | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && !Array.isArray(val)) return val as Record<string, unknown>;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { raw: val };
    }
  }
  return { value: val };
}

function formatVal(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditDiffViewer({ before, after, locale = "th" }: AuditDiffViewerProps) {
  const [copied, setCopied] = React.useState(false);
  const [rawView, setRawView] = React.useState(false);
  const [showUnchanged, setShowUnchanged] = React.useState(false);

  const beforeObj = React.useMemo(() => parseJsonSafe(before), [before]);
  const afterObj = React.useMemo(() => parseJsonSafe(after), [after]);

  const hasBefore = beforeObj !== null && Object.keys(beforeObj).length > 0;
  const hasAfter = afterObj !== null && Object.keys(afterObj).length > 0;

  const diffItems = React.useMemo<DiffItem[]>(() => {
    if (!hasBefore && !hasAfter) return [];

    const keys = Array.from(
      new Set([...Object.keys(beforeObj ?? {}), ...Object.keys(afterObj ?? {})])
    ).sort();

    return keys.map((key) => {
      const bVal = beforeObj ? beforeObj[key] : undefined;
      const aVal = afterObj ? afterObj[key] : undefined;
      const bHas = beforeObj !== null && Object.prototype.hasOwnProperty.call(beforeObj, key);
      const aHas = afterObj !== null && Object.prototype.hasOwnProperty.call(afterObj, key);

      if (!bHas && aHas) {
        return { key, type: "added" as const, afterValue: aVal };
      }
      if (bHas && !aHas) {
        return { key, type: "removed" as const, beforeValue: bVal };
      }
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        return { key, type: "changed" as const, beforeValue: bVal, afterValue: aVal };
      }
      return { key, type: "unchanged" as const, beforeValue: bVal, afterValue: aVal };
    });
  }, [beforeObj, afterObj, hasBefore, hasAfter]);

  const changedItems = React.useMemo(
    () => diffItems.filter((item) => item.type !== "unchanged"),
    [diffItems]
  );
  const itemsToDisplay = showUnchanged ? diffItems : changedItems;

  const copyPayload = React.useCallback(() => {
    const text = JSON.stringify({ before: beforeObj, after: afterObj }, null, 2);
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [beforeObj, afterObj]);

  if (!hasBefore && !hasAfter) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
        <History className="size-5 text-muted-foreground/60" />
        <p>
          {locale === "th"
            ? "ไม่มีข้อมูลการเปลี่ยนแปลงโครงสร้าง (บันทึกจากระบบรุ่นก่อนหน้า)"
            : "No structured change data available (recorded in previous version)"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!hasBefore && hasAfter ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800">
              {locale === "th" ? "+ สร้างข้อมูลใหม่" : "+ Created"}
            </Badge>
          ) : hasBefore && !hasAfter ? (
            <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800">
              {locale === "th" ? "- ลบข้อมูล" : "- Deleted"}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800">
              {locale === "th" ? "แก้ไขข้อมูล" : "Modified"}
            </Badge>
          )}

          {diffItems.some((d) => d.type === "unchanged") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowUnchanged((prev) => !prev)}
            >
              {showUnchanged
                ? locale === "th"
                  ? "ซ่อนฟิลด์ที่ไม่เปลี่ยน"
                  : "Hide unchanged"
                : locale === "th"
                ? `ดูทั้งหมด (${diffItems.length} ฟิลด์)`
                : `Show all (${diffItems.length} fields)`}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setRawView((prev) => !prev)}
          >
            {rawView ? <GitCompare className="size-3.5" /> : <FileCode className="size-3.5" />}
            {rawView
              ? locale === "th"
                ? "มุมมอง Diff"
                : "Diff view"
              : locale === "th"
              ? "ดู Raw JSON"
              : "Raw JSON"}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={copyPayload}
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            {copied
              ? locale === "th"
                ? "คัดลอกแล้ว"
                : "Copied"
              : locale === "th"
              ? "คัดลอก JSON"
              : "Copy JSON"}
          </Button>
        </div>
      </div>

      {rawView ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-3 font-mono text-xs">
            <div className="mb-2 font-semibold text-muted-foreground">
              {locale === "th" ? "ก่อนการเปลี่ยนแปลง (Before)" : "Before"}
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
              {hasBefore ? JSON.stringify(beforeObj, null, 2) : "—"}
            </pre>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 font-mono text-xs">
            <div className="mb-2 font-semibold text-muted-foreground">
              {locale === "th" ? "หลังการเปลี่ยนแปลง (After)" : "After"}
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
              {hasAfter ? JSON.stringify(afterObj, null, 2) : "—"}
            </pre>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="divide-y divide-border/60">
            {itemsToDisplay.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {locale === "th" ? "ไม่มีฟิลด์ที่มีการเปลี่ยนแปลงค่า" : "No fields changed"}
              </div>
            ) : (
              itemsToDisplay.map((item) => {
                if (item.type === "added") {
                  return (
                    <div
                      key={item.key}
                      className="flex items-start gap-2 bg-emerald-500/10 px-3 py-2 text-xs font-mono text-emerald-900 dark:text-emerald-300 border-l-4 border-emerald-500"
                    >
                      <Plus className="size-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-foreground mr-1.5">{item.key}:</span>
                        <span className="break-all">{formatVal(item.afterValue)}</span>
                      </div>
                    </div>
                  );
                }

                if (item.type === "removed") {
                  return (
                    <div
                      key={item.key}
                      className="flex items-start gap-2 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-900 dark:text-red-300 border-l-4 border-red-500"
                    >
                      <Minus className="size-3.5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-foreground mr-1.5 line-through">{item.key}:</span>
                        <span className="break-all line-through">{formatVal(item.beforeValue)}</span>
                      </div>
                    </div>
                  );
                }

                if (item.type === "changed") {
                  return (
                    <div key={item.key} className="flex flex-col text-xs font-mono">
                      <div className="flex items-start gap-2 bg-red-500/10 px-3 py-1.5 text-red-900 dark:text-red-300 border-l-4 border-red-500">
                        <Minus className="size-3.5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-foreground mr-1.5">{item.key}:</span>
                          <span className="break-all">{formatVal(item.beforeValue)}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 bg-emerald-500/10 px-3 py-1.5 text-emerald-900 dark:text-emerald-300 border-l-4 border-emerald-500">
                        <Plus className="size-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-foreground mr-1.5">{item.key}:</span>
                          <span className="break-all">{formatVal(item.afterValue)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Unchanged
                return (
                  <div
                    key={item.key}
                    className="flex items-start gap-2 bg-muted/20 px-3 py-1.5 text-xs font-mono text-muted-foreground border-l-4 border-transparent"
                  >
                    <span className="size-3.5 shrink-0 text-center text-muted-foreground/50"> </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-foreground mr-1.5">{item.key}:</span>
                      <span className="break-all">{formatVal(item.afterValue)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
