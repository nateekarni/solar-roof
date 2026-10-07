// Shared presentation for site creation and editing, including nested field editors.
export const siteControlsClassName = "[&_input]:bg-card [&_textarea]:bg-card [&_[data-slot=select-trigger]]:bg-card [&_input:disabled]:opacity-100 [&_[data-slot=field]]:gap-2 [&_[data-slot=label]]:leading-snug [&_[data-slot=field-label]]:leading-snug";
export const siteFormClassName = `space-y-4 pt-2 ${siteControlsClassName}`;
export const siteTabsListClassName = "w-full shrink-0 bg-tabs-background text-tabs-foreground group-data-horizontal/tabs:h-auto min-h-10";
export const siteTabsTriggerClassName = "min-h-10 whitespace-normal text-center data-active:bg-primary data-active:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground";
