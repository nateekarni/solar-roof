/** Match icon-bearing controls to SearchInput: 12px inset, 16px icon, 12px text gap. */
export const iconInputLayout = {
  trigger: "gap-3 px-3",
  icon: "size-4 shrink-0",
  overlayIcon: "absolute left-[calc(0.75rem+1px)] top-1/2 -translate-y-1/2",
  input: "pl-10",
} as const;
