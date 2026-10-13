export function pageSelection(selected: string[], pageIds: string[]): boolean | 'indeterminate' {
 const count = pageIds.filter(id => selected.includes(id)).length;
 return count === 0 ? false : count === pageIds.length ? true : 'indeterminate';
}
export function togglePageSelection(selected: string[], pageIds: string[], checked: boolean) {
 return checked ? [...new Set([...selected, ...pageIds])] : selected.filter(id => !pageIds.includes(id));
}
export function pruneSelection(selected: string[], availableIds: string[]) {
 const available = new Set(availableIds);
 return selected.filter(id => available.has(id));
}
export function hiddenSelectionCount(selected: string[], filteredIds: string[]) {
 const visible = new Set(filteredIds);
 return selected.filter(id => !visible.has(id)).length;
}
