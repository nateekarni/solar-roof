"use client";

import { Bell, ChevronDown } from "lucide-react";
import { t } from "@solar/i18n";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";

export function Topbar() {
  return <header className="topbar"><div><span className="eyebrow">{t("app.platform")}</span><h1>{t("dashboard.title")}</h1></div><div className="top-actions"><Button variant="outline" size="icon" aria-label={t("navigation.alerts")} className="icon-button"><Bell aria-hidden="true" /><span className="notification-dot" /></Button><Button variant="outline" className="user-pill"><Avatar className="avatar small"><AvatarFallback>O</AvatarFallback></Avatar>Owner <ChevronDown aria-hidden="true" /></Button></div></header>;
}
