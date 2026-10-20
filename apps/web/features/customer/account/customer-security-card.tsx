"use client";
import { useT } from "../../../providers/locale-provider";
import { OwnPassword } from "../../settings/own-password";
import { OwnAuthenticator } from "../../settings/own-authenticator";
import { customerAccountCard } from "./customer-account-presentation";

export function CustomerSecurityCard() {
  const t = useT();
  return (
    <section
      className={customerAccountCard}
      aria-labelledby="customer-security-title"
    >
      <div data-customer-card-heading="true" className="space-y-1">
        <h2 id="customer-security-title" className="text-lg font-semibold">
          {t("customerPortal.account.security")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("customerPortal.account.securityDescription")}
        </p>
      </div>
      <div
        data-customer-account-list="true"
        className="[&>*]:border-t-0"
      >
        <OwnPassword />
        <OwnAuthenticator />
      </div>
    </section>
  );
}
