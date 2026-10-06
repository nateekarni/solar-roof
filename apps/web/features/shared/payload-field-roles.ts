import type { PayloadField } from "../sites/payload-contracts";

export function assignStandardFieldRole(field: PayloadField): PayloadField {
  if (field.role) return field;
  if (field.tag === "energy.active.import.total" && field.targetUnit === "kWh") return {...field, role:"billing-import"};
  if (["power.active.total","solar.active_power"].includes(field.tag) && field.targetUnit === "W") return {...field,role:"active-power"};
  return field;
}
