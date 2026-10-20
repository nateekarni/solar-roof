import type { CustomerPortalBill } from "./customer-portal.js";

// Compile-time consumer checks: legacy breakdown fields may be absent, while
// the authoritative persisted total remains a required decimal string.
type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type SubtotalContract = Assert<
  Equal<CustomerPortalBill["subtotal"], string | null>
>;
type TaxContract = Assert<Equal<CustomerPortalBill["tax"], string | null>>;
type TotalContract = Assert<Equal<CustomerPortalBill["billedAmount"], string>>;
