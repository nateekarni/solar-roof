"use client";

import { MapPin, X } from "lucide-react";
import type { StyleSpecification } from "maplibre-gl";
import React from "react";
import {MapUnavailable} from "./map-unavailable";
import {useSiteSelection} from './site-selection-provider';
import {dashboardScopeMatches} from './site-selection';
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useLocale } from "../../providers/locale-provider";

type Site = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  status?: string;
  capacityMwp?: number;
  schoolName: string;
  productionKwh?: number | null;
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

export function SiteMap({ sites,availableSites,dataSiteId }: { sites: Site[]; availableSites?: Pick<Site,'id'|'name'|'schoolName'|'latitude'|'longitude'>[]|undefined; dataSiteId?:string|undefined }) {
  const {selectedSiteId,chooseSite}=useSiteSelection();
  const scoped=dashboardScopeMatches(selectedSiteId,dataSiteId);
  const mapSites=(availableSites??sites).map(site=>({...site,...(scoped?sites.find(value=>value.id===site.id):undefined)}));
  const locale = useLocale();
  const th = locale === "th";
  const formatNumber = (value: number | null | undefined) => value == null
    ? (th ? "ไม่มีข้อมูล" : "No data")
    : new Intl.NumberFormat(th ? "th-TH" : "en-US", { maximumFractionDigits: 2 }).format(value);
  const validSites = mapSites.filter(
    (site) => site.latitude !== null && site.longitude !== null,
  );

  const [mapFailed,setMapFailed]=React.useState(false);
  const selectedId=selectedSiteId;
  const setSelectedId=(id:string|null)=>chooseSite(id||'');
  const selected = validSites.find((site) => site.id === selectedId) ?? null;

  const counts = {
    online: validSites.filter((s) => s.status === "online").length,
    warning: validSites.filter(
      (s) => s.status === "warning" || s.status === "degraded",
    ).length,
    offline: validSites.filter((s) => s.status === "offline").length,
  };

  if(validSites.length===0)return <Card className="panel map-panel flex h-full flex-col"><CardHeader className="p-0 pb-3"><CardTitle className="text-sm">{th?'แผนที่ไซต์':'Site map'}</CardTitle></CardHeader><CardContent className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-0 text-center text-sm text-muted-foreground"><MapPin className="size-7 text-muted-foreground/50"/><p>{th?'ยังไม่มีไซต์ที่มีพิกัดบนแผนที่':'No sites with map coordinates'}</p></CardContent></Card>;
  return (
    <Card className="panel map-panel flex flex-col h-full">
      <CardHeader className="p-0 pb-2.5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">
            {th ? "แผนที่ไซต์" : "Site map"}
          </CardTitle>
          <Badge variant="secondary" className="text-xs font-normal">
            {validSites.length} {th ? "ไซต์บนแผนที่" : "mapped sites"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="map-content relative flex flex-col flex-1 p-0 min-h-0">
        <div className="site-map relative flex-1 min-h-[260px] sm:min-h-[350px] w-full rounded-xl overflow-hidden border border-border">
          {mapFailed?<MapUnavailable sites={validSites} locale={locale} selectedId={selectedId} onSelect={chooseSite}/>:<Map
            initialViewState={{ latitude: 13.75, longitude: 100.8, zoom: 5.5 }}
            mapStyle={style}
            onError={()=>setMapFailed(true)}
            reuseMaps
          >
            <NavigationControl position="bottom-right" showCompass={false} />

            {validSites.map((site) => {
              const markerStatus =
                site.status === "online"
                  ? "online"
                  : site.status === "offline"
                    ? "offline"
                    : site.status ? "degraded" : "unavailable";

              return (
                <Marker
                  key={site.id}
                  latitude={site.latitude!}
                  longitude={site.longitude!}
                  anchor="center"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className={`size-4 gap-0 p-0 map-marker ${markerStatus} ${
                      selectedId === site.id
                        ? "selected ring-2 ring-primary ring-offset-2"
                        : ""
                    }`}
                    aria-label={`${th ? "เลือก" : "Select"} ${site.name}`}
                    aria-pressed={selectedId === site.id}
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
                  {selected.status && <span
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
                      ? (th ? "ออนไลน์" : "Online")
                      : selected.status === "offline"
                        ? (th ? "ออฟไลน์" : "Offline")
                        : (th ? "แจ้งเตือน" : "Warning")}
                  </span>}
                  <strong className="text-foreground">{selected.name}</strong>
                  <span className="text-muted-foreground">
                    {selected.schoolName}
                  </span>
                  {scoped && <small className="font-semibold text-primary">
                    {formatNumber(selected.productionKwh)} kWh ·{" "}
                    {formatNumber(selected.capacityMwp)} MWp
                  </small>}
                </div>
              </Popup>
            )}
          </Map>}

          {/* Status Legend Overlay in Bottom-Left */}
          {!mapFailed&&!selectedId&&scoped&&<div className="absolute bottom-3 left-3 z-10 rounded-lg border border-border/70 bg-card/95 p-3 shadow-md backdrop-blur-sm">
            <p className="text-[11px] font-bold text-foreground mb-1.5">
              {th ? "สถานะไซต์ที่มีพิกัด" : "Status of mapped sites"}
            </p>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-success" />
                  {th ? "ออนไลน์" : "Online"}
                </span>
                <strong className="text-foreground font-semibold">
                  {counts.online}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-warning" />
                  {th ? "แจ้งเตือน" : "Warning"}
                </span>
                <strong className="text-foreground font-semibold">
                  {counts.warning}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full bg-destructive" />
                  {th ? "ออฟไลน์" : "Offline"}
                </span>
                <strong className="text-foreground font-semibold">
                  {counts.offline}
                </strong>
              </div>
            </div>
          </div>}
        </div>

        {/* Always-visible Site / Overall Info Bar */}
        <div className="site-info-bar border-t-0 pt-2.5 px-0 bg-transparent">
          <div className="site-info-left">
            <strong className="site-name">
              {selected ? selected.name : th ? "ภาพรวมไซต์บนแผนที่" : "Mapped sites overview"}
            </strong>
            <span className="site-sub">
              {selected
                ? selected.schoolName
                : `${validSites.length} ${th ? "ไซต์ที่มีพิกัด • เลือกไซต์เพื่อดูรายละเอียด" : "sites with coordinates • Select a site for details"}`}
            </span>
          </div>
          {selected && <div className="site-metrics">
            {scoped && <>
            <div className="metric">
              <b>
                {formatNumber(selected.productionKwh)}
              </b>
              <span>kWh {th ? "ช่วงเวลาที่เลือก" : "Selected period"}</span>
            </div>
            <div className="metric">
              <b>
                {formatNumber(selected.capacityMwp)}
              </b>
              <span>MWp {th ? "กำลังติดตั้ง" : "Installed capacity"}</span>
            </div>
            </>}
            {selected && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setSelectedId(null)}
                className="h-auto gap-0 px-0 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted cursor-pointer"
                aria-label={th ? "ปิดและกลับสู่ภาพรวม" : "Close and return to overview"}
                title={th ? "ปิดและกลับสู่ภาพรวม" : "Close and return to overview"}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>}
        </div>
      </CardContent>
    </Card>
  );
}
