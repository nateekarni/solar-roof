'use client';
import { useState } from 'react';
import { useSiteSelection } from './site-selection-provider';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useLocale } from '../../providers/locale-provider';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../../components/ui/command';

export function SiteFilter({ sites,allowAll=true }: { sites: { id: string; name: string; externalSiteId?: string | null }[];allowAll?:boolean }) {
  const {selectedSiteId:selected,chooseSite}=useSiteSelection();
  const th = useLocale() === 'th';
  const [open, setOpen] = useState(false);
  const options = allowAll?[{ id: '', name: th ? 'ทุกไซต์' : 'All sites' }, ...sites]:sites;
  if(!allowAll)return <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">{sites[0]?.name??(th?'ยังไม่ได้รับสิทธิ์ไซต์งาน':'No assigned site')}{sites[0]?.externalSiteId?` · ${sites[0].externalSiteId}`:''}</p>;
  function choose(id: string) {
    chooseSite(id);
    setOpen(false);
  }
  return <div className="flex items-center gap-2 text-sm">
    <span>{th ? 'ไซต์' : 'Site'}</span>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={open} aria-label={th ? 'เลือกไซต์' : 'Select site'} className="w-48 justify-between">
        <span className="truncate">{options.find(site => site.id === selected)?.name ?? (th ? 'เลือกไซต์' : 'Select site')}{selected && <> · {sites.find(site=>site.id===selected)?.externalSiteId??(th?'ยังไม่มีรหัส':'No registered code')}</>}</span><ChevronsUpDown />
      </Button></PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command><CommandInput placeholder={th ? 'ค้นหาไซต์…' : 'Search sites…'} /><CommandList>
          <CommandEmpty>{th ? 'ไม่พบไซต์' : 'No sites found'}</CommandEmpty>
          {options.map(site => <CommandItem key={site.id} value={`${site.name} ${site.externalSiteId??""}`} onSelect={() => choose(site.id)}>
            <Check className={selected === site.id ? 'opacity-100' : 'opacity-0'} />{site.name}{site.id && <span className="text-muted-foreground">{site.externalSiteId??(th?"ยังไม่มีรหัส":"No registered code")}</span>}
          </CommandItem>)}
        </CommandList></Command>
      </PopoverContent>
    </Popover>
  </div>;
}
