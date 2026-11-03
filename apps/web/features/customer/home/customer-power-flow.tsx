import { House, SunMedium, UtilityPole } from "lucide-react";
import type { Locale } from "@solar/i18n";
import { Badge } from "../../../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";

export interface CustomerPowerFlowMeasurements {
  observedAt: string;
  solarKw: number | null;
  loadKw: number | null;
  gridImportKw: number | null;
  gridExportKw: number | null;
  solarToLoadKw: number | null;
}

const isPower = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0;

function PowerValue({ value, locale }: { value: number | null; locale: Locale }) {
  if (!isPower(value))
    return (
      <span data-power-value="unavailable" className="tabular-nums">
        —
      </span>
    );
  return (
    <span data-power-value="available" className="tabular-nums">
      {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}
      <span className="ml-1 text-xs font-normal text-muted-foreground">kW</span>
    </span>
  );
}

export function CustomerPowerFlow({
  locale,
  measurements,
  now = Date.now(),
}: {
  locale: Locale;
  measurements: CustomerPowerFlowMeasurements | null;
  now?: number;
}) {
  const th = locale === "th";
  const observedAt = Date.parse(measurements?.observedAt ?? "");
  const fresh = Boolean(
    measurements &&
      Number.isFinite(observedAt) &&
      now - observedAt >= 0 &&
      now - observedAt <= 120_000,
  );
  const solarKw = fresh && isPower(measurements?.solarKw ?? null) ? measurements!.solarKw : null;
  const loadKw = fresh && isPower(measurements?.loadKw ?? null) ? measurements!.loadKw : null;
  const gridImportKw = fresh && isPower(measurements?.gridImportKw ?? null) ? measurements!.gridImportKw : null;
  const gridExportKw = fresh && isPower(measurements?.gridExportKw ?? null) ? measurements!.gridExportKw : null;
  const solarToLoadKw =
    fresh && isPower(measurements?.solarToLoadKw ?? null)
      ? measurements!.solarToLoadKw
      : null;
  const solarFlow =
    isPower(solarKw) && isPower(loadKw) && isPower(solarToLoadKw) && solarToLoadKw > 0;
  const gridImportActive = isPower(gridImportKw) && gridImportKw > 0;
  const gridExportActive = !gridImportActive && isPower(gridExportKw) && gridExportKw > 0;
  const gridFlow = isPower(loadKw) && gridImportActive;
  const hasDirectionalFlow = solarFlow || gridFlow;
  const gridValue = gridImportActive
    ? gridImportKw
    : gridExportActive
      ? gridExportKw
      : isPower(gridImportKw)
        ? gridImportKw
        : isPower(gridExportKw)
          ? gridExportKw
          : null;
  const measurementsAvailable = [solarKw, loadKw, gridValue].every(isPower);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const nodes = [
    {
      label: th ? "โซลาร์" : "Solar",
      detail: th ? "กำลังผลิตที่วัดได้" : "Measured generation",
      value: solarKw,
      Icon: SunMedium,
      tone: "solar",
    },
    {
      label: th ? "โหลด" : "Load",
      detail: th ? "การใช้ไฟฟ้าที่วัดได้" : "Measured consumption",
      value: loadKw,
      Icon: House,
      tone: "load",
    },
    {
      label: th ? "โครงข่าย" : "Grid",
      detail: gridImportActive
        ? th
          ? "รับไฟจากโครงข่าย"
          : "Grid import"
        : gridExportActive
          ? th
            ? "ส่งไฟเข้าโครงข่าย"
            : "Grid export"
          : isPower(gridValue)
            ? th
              ? "ไม่มีการแลกเปลี่ยนกับโครงข่าย"
              : "No grid exchange"
          : th
            ? "ทิศทางไม่พร้อมใช้งาน"
            : "Direction unavailable",
      value: gridValue,
      Icon: UtilityPole,
      tone: "grid",
    },
  ];

  return (
    <Card
      data-dashboard-area="flow"
      className="customer-dashboard-panel customer-flow-panel border border-primary/35 py-0"
      aria-labelledby="power-flow-title"
    >
      <CardHeader className="border-b border-border/70 px-3 py-2.5 sm:px-5 sm:py-3.5">
        <CardTitle id="power-flow-title" className="flex items-center gap-2 text-sm sm:text-lg">
          {th ? "ภาพรวมกำลังไฟฟ้าขณะนี้" : "Power flow right now"}
        </CardTitle>
        <CardDescription className="sr-only">
          {th
            ? "แสดงเฉพาะค่ากำลังไฟฟ้าขณะนั้นที่ตรวจสอบแหล่งที่มาและทิศทางแล้ว"
            : "Only verified instantaneous measurements and directions are shown."}
        </CardDescription>
        <Badge
          variant={measurementsAvailable ? "default" : "outline"}
          className="col-start-2 row-span-2 row-start-1 self-start justify-self-end rounded-md border-primary/35 font-mono text-[10px] uppercase tracking-wide"
        >
          {measurementsAvailable
            ? th
              ? "ข้อมูลสด"
              : "Live"
            : th
              ? "ไม่พร้อมใช้งาน"
              : "Unavailable"}
        </Badge>
      </CardHeader>
      <CardContent className="px-3 py-3 sm:px-5 sm:py-4">
        <div className="relative grid grid-cols-3 items-start gap-1 sm:gap-3">
          <div
            aria-hidden="true"
            className="absolute left-[16.667%] right-[16.667%] top-8 grid grid-cols-2 sm:top-10"
          >
            <span className="customer-flow-line">
              {solarFlow && (
                <span
                  data-flow-particles="solar-load"
                  className="customer-flow-particle customer-flow-particle-forward"
                />
              )}
            </span>
            <span className="customer-flow-line">
              {gridFlow && (
                <span
                  data-flow-particles="grid-load"
                  className="customer-flow-particle customer-flow-particle-reverse"
                />
              )}
            </span>
          </div>
          {nodes.map(({ label, detail, value, Icon, tone }, index) => (
            <article key={label} data-flow-node={tone} className="relative flex min-w-0 flex-col items-center text-center">
              <div
                className={`customer-flow-node grid size-16 place-items-center rounded-full border bg-card sm:size-20 ${
                  `customer-flow-node-${tone}`
                } ${
                  index === 1
                    ? "ring-4 ring-primary/8"
                    : ""
                }`}
              >
                <Icon aria-hidden="true" className="size-5 sm:size-6" strokeWidth={1.7} />
                <span className="-mt-3 font-mono text-xs font-semibold sm:text-sm">
                  <PowerValue value={value} locale={locale} />
                </span>
              </div>
              <h3 className="mt-1.5 text-xs font-semibold uppercase tracking-wide sm:text-sm">{label}</h3>
              <p className="mt-1 hidden max-w-28 text-[11px] leading-4 text-muted-foreground sm:block">{detail}</p>
            </article>
          ))}
        </div>

        <p className="sr-only" role="status">
          {hasDirectionalFlow
            ? th
              ? "ทิศทางการไหลอ้างอิงจากค่าที่วัดได้ล่าสุด"
              : "Flow direction uses the latest verified measurements."
            : measurementsAvailable
              ? th
                ? "ค่าที่วัดได้ล่าสุดได้รับการตรวจสอบแล้ว และไม่มีการไหลเข้าที่กำลังทำงาน"
                : "Latest verified readings show no active inbound flow."
            : th
              ? "ข้อมูลการไหลของกำลังไฟฟ้าไม่พร้อมใช้งาน"
              : "Power flow is unavailable"}
        </p>
        <div className="sr-only">
          {solarFlow && (
            <span aria-label={`${th ? "โซลาร์ไปยังโหลด" : "Solar to Load"}: ${number.format(solarToLoadKw)} kW`} />
          )}
          {gridFlow && (
            <span aria-label={`${th ? "โครงข่ายไปยังโหลด" : "Grid to Load"}: ${number.format(gridImportKw)} kW`} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
