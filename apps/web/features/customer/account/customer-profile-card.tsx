"use client";

import { useState } from "react";
import { Mail, Pencil, Phone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useT } from "@/providers/locale-provider";
import { useAuth } from "@/stores/auth-store";
import { CustomerProfileModal } from "@/features/settings/customer-profile-modal";
import { customerAccountCard } from "./customer-account-presentation";

export function CustomerProfileCard() {
  const t = useT();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const initials = (user?.displayName || user?.email || "CU")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section
      className={customerAccountCard}
      aria-labelledby="customer-profile-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div data-customer-card-heading="true" className="min-w-0 space-y-1">
          <h2 id="customer-profile-title" className="text-lg font-semibold">
            {t("customerPortal.account.profile")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("customerPortal.account.profileDescription")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="bg-background"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-4" />
          {t("customerPortal.account.editProfile")}
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <Avatar className="size-20 border border-border">
          {user?.avatarData && (
            <AvatarImage src={user.avatarData} alt={user.displayName || ""} />
          )}
          <AvatarFallback className="bg-muted text-xl font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("customerPortal.account.displayName")}
          </p>
          <p className="break-words font-medium">
            {user?.displayName || t("customerPortal.common.unavailable")}
          </p>
          <div className="space-y-1.5 pt-1 text-sm text-muted-foreground">
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">{t("customerPortal.account.email")}: </span>
              <span className="min-w-0 break-all text-foreground">{user?.email || "-"}</span>
            </p>
            <p className="flex min-w-0 items-center gap-2">
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">{t("customerPortal.account.phoneNumber")}: </span>
              <span className="min-w-0 break-words text-foreground">{user?.phoneNumber || "-"}</span>
            </p>
          </div>
        </div>
      </div>

      <CustomerProfileModal open={editing} onOpenChange={setEditing} showPhone />
    </section>
  );
}
