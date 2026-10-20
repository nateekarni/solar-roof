import type {
  PaymentSubmission,
  TransferChannel,
} from "@solar/api-contracts";
import { transferAmount } from "../../billing/payment-input";
export type PaymentStep = "payment" | "review" | "pending";
export type PaymentErrors = Partial<
  Record<"amount" | "paidAt" | "evidence" | "submission", string>
>;
export interface PaymentDraft {
  outstanding: string;
  amount: string;
  amountMode: "full" | "other";
  paidAt: string;
  transferChannel: TransferChannel;
  note: string;
  evidence: { name: string; type: string; size: number } | null;
  evidenceKey: string;
  slipUrl: string;
}
function minor(value: string): bigint {
  if (!/^\d+(\.\d{1,2}0*)?$/.test(value))
    throw new Error("Invalid stored amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}
export function createPaymentDraft(
  outstanding: string,
  today: string,
): PaymentDraft {
  let amount = "";
  try {
    const value = minor(outstanding).toString().padStart(3, "0");
    amount = `${value.slice(0, -2)}.${value.slice(-2)}`;
  } catch {
    /* Unknown server balance must remain unavailable. */
  }
  return {
    outstanding,
    amount,
    amountMode: "full",
    paidAt: today,
    transferChannel: "bank_account",
    note: "",
    evidence: null,
    evidenceKey: "",
    slipUrl: "",
  };
}
export function validatePaymentDraft(
  draft: Pick<PaymentDraft, "amount" | "outstanding" | "paidAt">,
  today: string,
): PaymentErrors {
  const errors: PaymentErrors = {};
  try {
    const amount = transferAmount(draft.amount);
    if (minor(amount) > minor(draft.outstanding))
      errors.amount = "customerPortal.validation.amountExceedsOutstanding";
  } catch {
    errors.amount = "customerPortal.validation.positiveAmount";
  }
  const date = Date.parse(`${draft.paidAt}T12:00:00+07:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.paidAt) ||
    !Number.isFinite(date) ||
    new Date(date + 7 * 3600000).toISOString().slice(0, 10) !== draft.paidAt
  )
    errors.paidAt = "customerPortal.validation.invalidPaidDate";
  else if (draft.paidAt > today)
    errors.paidAt = "customerPortal.validation.futurePaidDate";
  return errors;
}
export function evidenceError(file: {
  type: string;
  size: number;
}): string | null {
  if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type))
    return "customerPortal.validation.unsupportedFileType";
  return file.size > 10 * 1024 * 1024
    ? "customerPortal.validation.fileTooLarge"
    : null;
}
export function paymentTransition(
  step: PaymentStep,
  action: "review" | "edit" | "submitted",
): PaymentStep {
  if (action === "review" && step === "payment") return "review";
  if (action === "edit" && step === "review") return "payment";
  if (action === "submitted" && step === "review") return "pending";
  return step;
}
export function paymentSubmission(draft: PaymentDraft): PaymentSubmission {
  return {
    amount: transferAmount(draft.amount),
    paidAt: new Date(`${draft.paidAt}T12:00:00+07:00`).toISOString(),
    paymentMethod: "bank_transfer",
    transferChannel: draft.transferChannel,
    ...(draft.note.trim() && { note: draft.note.trim() }),
    slipUrl: draft.slipUrl,
    evidenceKey: draft.evidenceKey,
  };
}
export function submissionErrorKey(error: unknown): string {
  const value = error as {
    status?: number;
    details?: { message?: unknown };
    code?: string;
  } | null;
  return value?.status === 409 &&
    (value.details?.message === "Transfer evidence already submitted" ||
      value.code === "DUPLICATE_EVIDENCE")
    ? "customerPortal.payment.duplicateEvidence"
    : "customerPortal.payment.failed";
}
