'use client';
import { useState } from 'react';
import { useSiteSelection } from './site-selection-provider';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useLocale } from '../../providers/locale-provider';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../../components/ui/command';

export function SiteFilter({ sites }: { sites: { id: string; name: string }[] }) {
  const {selectedSiteId:selected,chooseSite}=useSiteSelection();
  const th = useLocale() === 'th';
  const [open, setOpen] = useState(false);
  const options = [{ id: '', name: th ? 'ทุกไซต์' : 'All sites' }, ...sites];
  function choose(id: string) {
    chooseSite(id);
    setOpen(false);
  }
  return <div className="flex items-center gap-2 text-sm">
    <span>{th ? 'ไซต์' : 'Site'}</span>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={open} aria-label={th ? 'เลือกไซต์' : 'Select site'} className="w-48 justify-between">
        <span className="truncate">{options.find(site => site.id === selected)?.name ?? (th ? 'เลือกไซต์' : 'Select site')}</span><ChevronsUpDown />
      </Button></PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command><CommandInput placeholder={th ? 'ค้นหาไซต์…' : 'Search sites…'} /><CommandList>
          <CommandEmpty>{th ? 'ไม่พบไซต์' : 'No sites found'}</CommandEmpty>
          {options.map(site => <CommandItem key={site.id} value={`${site.name} ${site.id}`} onSelect={() => choose(site.id)}>
            <Check className={selected === site.id ? 'opacity-100' : 'opacity-0'} />{site.name}
          </CommandItem>)}
        </CommandList></Command>
      </PopoverContent>
    </Popover>
  </div>;
}
