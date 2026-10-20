"use client";
import { useT } from "../../../providers/locale-provider";
import { DialogPresentationContext } from "../../../components/ui/dialog";
import { CustomerOrganizationCard } from "./customer-organization-card";
import { CustomerProfileCard } from "./customer-profile-card";
import { CustomerNotificationCard } from "./customer-notification-card";
import { CustomerSecurityCard } from "./customer-security-card";
import { customerAccountDialog } from "./customer-account-presentation";

export function CustomerAccountPage() {
  const t = useT();
  return (
    <DialogPresentationContext.Provider value={customerAccountDialog}>
      <div className="customer-account space-y-6 [&_button:not([data-slot=switch])]:min-h-11 [&_button:not([data-slot=switch])]:min-w-11 [&_a]:min-h-11 [&_input]:min-h-11 [&_input]:text-base">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("customerPortal.account.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("customerPortal.account.description")}
          </p>
        </header>
        <CustomerProfileCard />
        <CustomerOrganizationCard />
        <CustomerNotificationCard />
        <CustomerSecurityCard />
      </div>
    </DialogPresentationContext.Provider>
  );
}
