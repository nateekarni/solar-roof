"use client";
import * as React from "react";
import { X } from "lucide-react";
import type { CustomerPaymentInstructions } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { apiClient } from "../../../lib/api-client";
import { bangkokTransferWallTime } from "../../billing/payment-input";
import {
  createPaymentDraft,
  evidenceError,
  paymentSubmission,
  paymentTransition,
  submissionErrorKey,
  validatePaymentDraft,
  type PaymentDraft,
  type PaymentErrors,
  type PaymentStep,
} from "./customer-payment-model";
import { PaymentInstructionsStep } from "./payment-instructions-step";
import { PaymentEvidenceStep } from "./payment-evidence-step";
import { PaymentPendingStep } from "./payment-pending-step";
import { formatMoney } from "../home/customer-home-format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingCycle: {
    id: string;
    outstandingAmount: string;
    invoiceNumber?: string | null;
  };
  locale: Locale;
  canSubmit: boolean;
  onSuccess?: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};
export function CustomerPaymentFlow(props: Props) {
  return props.open ? (
    <PaymentSession key={props.billingCycle.id} {...props} />
  ) : null;
}
function PaymentSession({
  onOpenChange,
  billingCycle,
  locale,
  canSubmit,
  onSuccess,
  returnFocusRef,
}: Props) {
  const t = createTranslator(locale);
  const [step, setStep] = React.useState<PaymentStep>("payment");
  const [draft, setDraft] = React.useState(() =>
    createPaymentDraft(
      billingCycle.outstandingAmount,
      bangkokTransferWallTime().slice(0, 10),
    ),
  );
  const [instructions, setInstructions] =
    React.useState<CustomerPaymentInstructions | null>(null);
  const [instructionError, setInstructionError] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [errors, setErrors] = React.useState<PaymentErrors>({});
  const [errorFocusRevision, setErrorFocusRevision] = React.useState(0);
  const [pending, setPending] = React.useState(false),
    [reading, setReading] = React.useState(false);
  const lock = React.useRef(false),
    fileVersion = React.useRef(0);
  const heading = React.useRef<HTMLHeadingElement>(null),
    summary = React.useRef<HTMLDivElement>(null);
  const originalFocus = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    originalFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      fileVersion.current++;
    };
  }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    setInstructionError(false);
    setInstructions(null);
    void apiClient
      .get<CustomerPaymentInstructions>(
        "/v1/customer/portal/payment-instructions",
        { signal: controller.signal, cache: "no-store" },
      )
      .then((value) => {
        if (!controller.signal.aborted) {
          setInstructions(value);
          setDraft((previous) => ({
            ...previous,
            transferChannel: value.promptpayId ? "promptpay" : "bank_account",
          }));
          setInstructionError(!value.available);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setInstructionError(true);
      });
    return () => controller.abort();
  }, [reload]);
  React.useEffect(() => {
    heading.current?.focus();
  }, [step]);
  React.useEffect(() => {
    if (errorFocusRevision) summary.current?.focus();
  }, [errorFocusRevision]);
  const change = (patch: Partial<PaymentDraft>) => {
    setDraft((previous) => ({
      ...previous,
      ...patch,
      ...(patch.amountMode === "full" && {
        amount: createPaymentDraft(previous.outstanding, previous.paidAt)
          .amount,
      }),
    }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next.submission;
      return next;
    });
  };
  const onFile = (file: File | null) => {
    const version = ++fileVersion.current;
    setReading(false);
    if (!file) {
      change({ evidence: null, evidenceKey: "", slipUrl: "" });
      return;
    }
    const error = evidenceError(file);
    if (error) {
      setErrors((previous) => ({ ...previous, evidence: error }));
      setErrorFocusRevision((previous) => previous + 1);
      return;
    }
    setErrors((previous) => {
      const next = { ...previous };
      delete next.evidence;
      delete next.submission;
      return next;
    });
    setDraft((previous) => ({
      ...previous,
      evidence: file,
      evidenceKey: `SLIP-${crypto.randomUUID()}`,
      slipUrl: "",
    }));
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (version !== fileVersion.current) return;
      setDraft((previous) => ({ ...previous, slipUrl: String(reader.result) }));
      setReading(false);
    };
    reader.onerror = () => {
      if (version === fileVersion.current) {
        setReading(false);
        setErrors((previous) => ({
          ...previous,
          evidence: "customerPortal.payment.failed",
        }));
        setErrorFocusRevision((previous) => previous + 1);
      }
    };
    reader.readAsDataURL(file);
  };
  const validate = () => {
    const next = validatePaymentDraft(
      draft,
      bangkokTransferWallTime().slice(0, 10),
    );
    if (!draft.evidence || !draft.slipUrl)
      next.evidence = "customerPortal.validation.evidenceRequired";
    else {
      const fileError = evidenceError(draft.evidence);
      if (fileError) next.evidence = fileError;
    }
    if (errors.evidence) next.evidence = errors.evidence;
    setErrors(next);
    if (Object.keys(next).length)
      setErrorFocusRevision((previous) => previous + 1);
    return Object.keys(next).length === 0;
  };
  const submit = async () => {
    if (
      lock.current ||
      step !== "review" ||
      !canSubmit ||
      !instructions?.available ||
      !validate()
    )
      return;
    lock.current = true;
    setPending(true);
    try {
      await apiClient.post(
        `/v1/billing-cycles/${encodeURIComponent(billingCycle.id)}/pay`,
        paymentSubmission(draft),
      );
      setStep((previous) => paymentTransition(previous, "submitted"));
      onSuccess?.();
    } catch (error) {
      setStep("payment");
      setErrors({ submission: submissionErrorKey(error) });
      setErrorFocusRevision((previous) => previous + 1);
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  const errorEntries = Object.entries(errors).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !lock.current) onOpenChange(false);
      }}
    >
        <DialogContent
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            heading.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (returnFocusRef?.current ?? originalFocus.current)?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (lock.current) event.preventDefault();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          className="customer-portal fixed inset-0! flex min-w-0 flex-col overflow-y-auto bg-background text-foreground outline-none max-sm:max-h-none! max-sm:rounded-none! max-sm:p-0! sm:max-w-none! md:inset-auto! md:left-1/2! md:top-1/2! md:max-h-[92dvh]! md:w-[calc(100%-4rem)]! md:max-w-4xl! md:-translate-x-1/2! md:-translate-y-1/2! md:gap-5 md:rounded-3xl! md:p-8!"
        >
          <div data-customer-payment-header="true" className="sticky top-0 z-10 flex h-[73px] min-h-[73px] items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 md:static md:h-auto md:min-h-0 md:items-start md:px-0 md:py-0 md:pb-5">
            <div className="min-w-0">
              <DialogTitle
                ref={heading}
                tabIndex={-1}
                className="text-lg font-semibold outline-none [&>[data-slot=dialog-title-icon]]:hidden"
              >
                {t(
                  step === "pending"
                    ? "customerPortal.payment.pending"
                    : step === "review"
                      ? "customerPortal.payment.review"
                      : "customerPortal.payment.title",
                )}
              </DialogTitle>
              {step !== "pending" && (
                <DialogDescription className="mt-0.5 truncate text-xs text-muted-foreground md:mt-1 md:text-sm">
                  {billingCycle.invoiceNumber ?? t("customerPortal.record.statement")} · {formatMoney(billingCycle.outstandingAmount, locale)} {t("customerPortal.common.baht")}
                </DialogDescription>
              )}
              {step === "pending" && (
                <DialogDescription className="sr-only">
                  {t("customerPortal.payment.pendingDescription")}
                </DialogDescription>
              )}
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                aria-label={t("customerPortal.common.close")}
                className="size-11! shrink-0 p-0! md:h-11! md:w-auto! md:px-4!"
              >
                <X data-icon="inline-start" className="md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">
                  {t("customerPortal.common.close")}
                </span>
              </Button>
            </DialogClose>
          </div>
          {errorEntries.length > 0 && (
            <div
              ref={summary}
              tabIndex={-1}
              role="alert"
              className="mx-4 mt-4 rounded-xl border border-destructive p-4 text-destructive md:mx-0 md:mt-0"
            >
              <p className="font-semibold">
                {t("customerPortal.payment.errorSummary")}
              </p>
              <ul className="mt-2 list-inside list-disc">
                {errorEntries.map(([key, value]) => (
                  <li key={key}>
                    {key !== "submission" ? (
                      <a
                        href={`#customer-${key}`}
                        className="inline-flex min-h-11 items-center underline"
                        onClick={(event) => {
                          event.preventDefault();
                          document.getElementById(`customer-${key}`)?.focus();
                        }}
                      >
                        {t(value)}
                      </a>
                    ) : (
                      t(value)
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="min-w-0 flex-1 p-4 md:p-0">
            {step === "payment" &&
              (instructionError ? (
                <div role="alert" className="space-y-4">
                  <p>{t("customerPortal.payment.unavailable")}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setReload((previous) => previous + 1)}
                  >
                    {t("customerPortal.common.retry")}
                  </Button>
                </div>
              ) : instructions ? (
                <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <PaymentInstructionsStep
                    instructions={instructions}
                    amount={draft.amount}
                    locale={locale}
                  />
                  <PaymentEvidenceStep
                    draft={draft}
                    errors={errors}
                    locale={locale}
                    onChange={change}
                    onFile={onFile}
                  />
                </div>
              ) : (
                <p role="status">{t("customerPortal.common.loading")}</p>
              ))}
            {step === "review" && (
              <section
                aria-labelledby="customer-payment-review-title"
                className="flex flex-col gap-4 rounded-2xl border border-border bg-[var(--customer-surface-elevated)] p-4"
              >
                <h2 id="customer-payment-review-title" className="font-semibold">
                  {t("customerPortal.payment.review")}
                </h2>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("customerPortal.payment.amount")}</dt>
                    <dd className="font-semibold tabular-nums">{formatMoney(draft.amount, locale)} {t("customerPortal.common.baht")}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("customerPortal.payment.paidAt")}</dt>
                    <dd className="font-semibold">{draft.paidAt}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("customerPortal.payment.method")}</dt>
                    <dd className="font-semibold">{t(`customerPortal.payment.${draft.transferChannel === "promptpay" ? "promptpay" : "bankTransfer"}`)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("customerPortal.payment.evidence")}</dt>
                    <dd className="break-all font-semibold">{draft.evidence?.name}</dd>
                  </div>
                </dl>
                {draft.note && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t("customerPortal.payment.note")}</p>
                    <p className="break-words">{draft.note}</p>
                  </div>
                )}
              </section>
            )}
            {step === "pending" && (
              <PaymentPendingStep
                locale={locale}
                recordHref={`/records/billing/${encodeURIComponent(billingCycle.id)}`}
              />
            )}
          </div>
          {step !== "pending" && (
            <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-3 border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:p-0 md:pt-4">
              {step === "review" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  className="min-h-[2.75rem]"
                  onClick={() => setStep((previous) => paymentTransition(previous, "edit"))}
                >
                  {t("customerPortal.payment.back")}
                </Button>
              )}
              <Button
                type="button"
                className="min-h-[2.75rem]"
                disabled={
                  pending || reading || !canSubmit || !instructions?.available
                }
                onClick={() => {
                  if (step === "payment") {
                    if (validate()) setStep((previous) => paymentTransition(previous, "review"));
                    return;
                  }
                  void submit();
                }}
              >
                {t(
                  pending
                    ? "customerPortal.payment.submitting"
                    : step === "review"
                      ? "customerPortal.payment.submit"
                      : "customerPortal.payment.next",
                )}
              </Button>
            </div>
          )}
        </DialogContent>
    </Dialog>
  );
}
