import type {OrganizationDraft} from '../organization/organization-selection';

export type BillingDraft = {
  serviceStartDate?: string | undefined;
  ratePerKwh?: number | string | undefined;
  paymentTermDays?: number | string | undefined;
  taxRate?: number | string | undefined;
  pricesIncludeTax?: boolean | undefined;
  taxConfirmed?: boolean | undefined;
  remindersEnabled?: boolean | undefined;
  reminderStartDays?: number | string | undefined;
  reminderIntervalDays?: number | string | undefined;
};

export function siteServicePayload(
  site: {name: string; capacity: number; externalSiteId: string; latitude: string; longitude: string},
  customer: OrganizationDraft,
  billing?: BillingDraft
) {
  const latitude = site.latitude.trim(), longitude = site.longitude.trim();
  if (Boolean(latitude) !== Boolean(longitude)) throw new Error('Provide both coordinates or neither / กรุณาระบุพิกัดทั้งสองค่า');
  const lat = latitude ? Number(latitude) : undefined, lng = longitude ? Number(longitude) : undefined;
  if ((lat !== undefined && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng !== undefined && (!Number.isFinite(lng) || Math.abs(lng) > 180))) {
    throw new Error('Invalid coordinates / พิกัดไม่ถูกต้อง');
  }
  if (!customer.name.trim()) throw new Error('Enter customer name / กรุณาระบุชื่อลูกค้า');
  if (customer.taxId?.trim() && !/^[0-9]{13}$/.test(customer.taxId.trim())) throw new Error('Tax ID must contain 13 digits / เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก');
  if (customer.code.trim() && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(customer.code.trim())) throw new Error('Invalid customer code / รหัสลูกค้าไม่ถูกต้อง');
  const name = site.name.trim();
  if (!name || !Number.isFinite(site.capacity) || site.capacity <= 0) throw new Error('Enter a site name and positive capacity / ระบุชื่อไซต์และกำลังติดตั้งที่มากกว่าศูนย์');
  const newOrganization = { ...customer, name: customer.name.trim(), code: customer.code.trim() || undefined };

  let billingFields: Record<string, unknown> = {};
  if (billing) {
    if (billing.ratePerKwh !== undefined && billing.ratePerKwh !== '') {
      const rate = Number(billing.ratePerKwh);
      if (!Number.isFinite(rate) || rate < 0) throw new Error('Tariff rate must be a non-negative number / อัตราค่าบริการต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับศูนย์');
      billingFields.ratePerKwh = rate;
    }
    if (billing.serviceStartDate?.trim()) {
      billingFields.serviceStartDate = billing.serviceStartDate.trim();
    }
    if (billing.paymentTermDays !== undefined && billing.paymentTermDays !== '') {
      const term = Number(billing.paymentTermDays);
      if (Number.isFinite(term) && term >= 0) billingFields.paymentTermDays = term;
    }
    if (billing.taxRate !== undefined && billing.taxRate !== '') {
      const tax = Number(billing.taxRate);
      if (Number.isFinite(tax) && tax >= 0) billingFields.taxRate = tax;
    }
    if (billing.pricesIncludeTax !== undefined) {
      billingFields.pricesIncludeTax = Boolean(billing.pricesIncludeTax);
    }
    if (billing.taxConfirmed !== undefined) {
      billingFields.taxConfirmed = Boolean(billing.taxConfirmed);
    }
    if (billing.remindersEnabled !== undefined) {
      billingFields.remindersEnabled = Boolean(billing.remindersEnabled);
    }
    if (billing.reminderStartDays !== undefined && billing.reminderStartDays !== '') {
      const days = Number(billing.reminderStartDays);
      if (Number.isFinite(days) && days >= 0) billingFields.reminderStartDays = days;
    }
    if (billing.reminderIntervalDays !== undefined && billing.reminderIntervalDays !== '') {
      const interval = Number(billing.reminderIntervalDays);
      if (Number.isFinite(interval) && interval > 0) billingFields.reminderIntervalDays = interval;
    }
  }

  return {
    name,
    capacityMwp: site.capacity,
    externalSiteId: site.externalSiteId.trim() || undefined,
    ...(lat === undefined ? {} : {latitude: lat, longitude: lng}),
    newOrganization,
    ...billingFields,
  };
}
