export const contractIdentityFields = ['companyName', 'taxId', 'branch', 'taxAddress', 'billingEmail', 'billingPhone'] as const;
export type ContractIdentityField = typeof contractIdentityFields[number];
export type ContractIdentityDefaults = Partial<Record<ContractIdentityField, string | null>>;
interface AutofillDependencies {
  loadDefaults: (siteId: string) => Promise<ContractIdentityDefaults>;
  setField: (field: ContractIdentityField, value: string) => void;
  setLoading: (loading: boolean) => void;
  onError: (error: unknown) => void;
}

/** Site owns identity defaults; presentation changes do not reset that ownership. */
export function createContractIdentityAutofill(dependencies: AutofillDependencies) {
  let selectedSiteId = '', opened = false, generation = 0;
  let requestActive = false, settled = false;
  // Track actual edits, including a user clearing back to the original empty value.
  const edited = new Set<ContractIdentityField>();
  return {
    markEdited(field: ContractIdentityField) { edited.add(field); },
    activate({ open, siteId }: { open: boolean; siteId: string }) {
      const siteChanged = selectedSiteId !== siteId;
      const contextChanged = siteChanged || opened !== open;
      selectedSiteId = siteId;
      opened = open;
      if (siteChanged) {
        edited.clear();
        settled = false;
        for (const field of contractIdentityFields) dependencies.setField(field, '');
      }
      if (!open || !siteId) {
        generation++;
        requestActive = false;
        if (contextChanged) dependencies.setLoading(false);
        return () => {};
      }
      // Locale-only redraws have the same identity context. A canceled effect,
      // including React Strict Mode's setup/cleanup cycle, can restart its load.
      if (!contextChanged && (requestActive || settled)) return () => {};
      const token = ++generation;
      requestActive = true;
      settled = false;
      const current = () => generation === token && requestActive;
      dependencies.setLoading(true);
      void dependencies.loadDefaults(siteId).then(defaults => {
        if (current()) for (const field of contractIdentityFields) {
          if (!edited.has(field)) dependencies.setField(field, defaults[field] ?? '');
        }
      }).catch(error => {
        if (current()) dependencies.onError(error);
      }).finally(() => {
        if (current()) {
          requestActive = false;
          settled = true;
          dependencies.setLoading(false);
        }
      });
      return () => {
        if (generation === token) {
          generation++;
          requestActive = false;
        }
      };
    },
  };
}
