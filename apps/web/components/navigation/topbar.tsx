"use client";

import { Bell, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";

export function Topbar() {
  return <header className="topbar"><div><span className="eyebrow">SOLAR ENERGY PLATFORM</span><h1>ภาพรวมผู้บริหาร</h1></div><div className="top-actions"><Button variant="outline" size="icon" aria-label="แจ้งเตือน" className="icon-button"><Bell /><span className="notification-dot" /></Button><Button variant="outline" className="user-pill"><Avatar className="avatar small"><AvatarFallback>O</AvatarFallback></Avatar>Owner <ChevronDown aria-hidden="true" /></Button></div></header>;
}
