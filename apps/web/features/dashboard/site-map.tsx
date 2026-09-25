"use client";

import { X } from "lucide-react";
import type { StyleSpecification } from "maplibre-gl";
import React from "react";
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

type Site = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  capacityMwp: number;
  schoolName: string;
  productionKwh: number;
};

const style: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
} as const;

const formatNumber = (value: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);

export function SiteMap({ sites }: { sites: Site[] }) {
  const validSites = (sites || []).filter(
    (site) => site.latitude !== null && site.longitude !== null,
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = validSites.find((site) => site.id === selectedId) ?? null;

  const totalProductionKwh = validSites.reduce(
    (sum, s) => sum + (s.productionKwh || 0),
    0,
  );
  const totalCapacityMwp = validSites.reduce(
    (sum, s) => sum + (s.capacityMwp || 0),
    0,
  );
  const schoolCount = new Set(validSites.map((s) => s.schoolName)).size;

  const counts = {
    online: validSites.filter((s) => s.status === "online").length,
    warning: validSites.filter(
      (s) => s.status === "warning" || s.status === "degraded",
    ).length,
    offline: validSites.filter((s) => s.status === "offline").length,
  };

  return (
    <Card className="panel map-panel flex flex-col h-full">
      <CardHeader className="p-0 pb-2.5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">
            แผนที่โรงเรียนทั้งหมด
          </CardTitle>
          <Badge variant="secondary" className="text-xs font-normal">
            {validSites.length} ไซต์
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="map-content relative flex flex-col flex-1 p-0 min-h-0">
        <div className="site-map relative flex-1 min-h-[260px] sm:min-h-[350px] w-full rounded-xl overflow-hidden border border-border">
          <Map
            initialViewState={{ latitude: 13.75, longitude: 100.8, zoom: 5.5 }}
            mapStyle={style}
            reuseMaps
          >
            <NavigationControl position="bottom-right" showCompass={false} />

            {validSites.map((site) => {
              const markerStatus =
                site.status === "online"
                  ? "online"
                  : site.status === "offline"
                    ? "offline"
                    : "degraded";

              return (
                <Marker
                  key={site.id}
                  latitude={site.latitude!}
                  longitude={site.longitude!}
                  anchor="center"
                >
                  <button
                    type="button"
                    className={`map-marker ${markerStatus} ${
                      selectedId === site.id
                        ? "selected ring-2 ring-primary ring-offset-2"
                        : ""
                    }`}
                    aria-label={`เลือก ${site.name}`}
                    onClick={() => setSelectedId(site.id)}
                  />
                </Marker>
              );
            })}

            {selected && (
              <Popup
                latitude={selected.latitude!}
                longitude={selected.longitude!}
                closeButton={true}
                closeOnClick={false}
                anchor="bottom"
                offset={12}
                onClose={() => setSelectedId(null)}
              >
                <div className="map-popup">
                  <span
                    className={`map-popup-status ${
                      selected.status === "online"
                        ? "online"
                        : selected.status === "offline"
                          ? "offline"
                          : "degraded"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full inline-block ${
                        selected.status === "online"
                          ? "bg-success"
                          : selected.status === "offline"
                            ? "bg-destructive"
                            : "bg-warning"
                      }`}
                    />
                    {selected.status === "online"
                      ? "ออนไลน์"
                      : selected.status === "offline"
                        ? "ออฟไลน์"
                        : "แจ้งเตือน"}
                  </span>
                  <strong className="text-foreground">{selected.name}</strong>
                  <span className="text-muted-foreground">
                    {selected.schoolName}
                  </span>
                  <small className="font-semibold text-primary">
                    {formatNumber(selected.productionKwh)} kWh ·{" "}
                    {formatNumber(selected.capacityMwp)} MWp
                  </small>
                </div>
              </Popup>
            )}
          </Map>

          {/* Status Legend Overlay in Bottom-Left */}
          <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-border/70 bg-card/95 p-3 shadow-md backdrop-blur-sm">
            <p className="text-[11px] font-bold text-foreground mb-1.5">
              สถานะโรงเรียน
            </p>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-success" />
                  ออนไลน์
                </span>
                <strong className="text-foreground font-semibold">
                  {counts.online}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-warning" />
                  แจ้งเตือน
                </span>
                <strong className="text-foreground font-semibold">
                  {counts.warning}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-destructive" />
                  ออฟไลน์
                </span>
                <strong className="text-foreground font-semibold">
                  {counts.offline}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Always-visible Site / Overall Info Bar */}
        <div className="site-info-bar border-t-0 pt-2.5 px-0 bg-transparent">
          <div className="site-info-left">
            <strong className="site-name">
              {selected ? selected.name : "ภาพรวมทุกไซต์พลังงาน"}
            </strong>
            <span className="site-sub">
              {selected
                ? selected.schoolName
                : `${validSites.length} ไซต์ จาก ${schoolCount} โรงเรียน`}
            </span>
          </div>
          <div className="site-metrics">
            <div className="metric">
              <b>
                {formatNumber(
                  selected ? selected.productionKwh : totalProductionKwh,
                )}
              </b>
              <span>kWh {selected ? "วันนี้" : "ผลิตสะสมรวมวันนี้"}</span>
            </div>
            <div className="metric">
              <b>
                {formatNumber(
                  selected ? selected.capacityMwp : totalCapacityMwp,
                )}
              </b>
              <span>MWp {selected ? "กำลังติดตั้ง" : "ติดตั้งรวม"}</span>
            </div>
            {selected && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted cursor-pointer"
                aria-label="ปิดและกลับสู่ภาพรวม"
                title="ปิดและกลับสู่ภาพรวม"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
