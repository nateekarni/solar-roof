'use client';

import {useCallback,useState} from 'react';
import {ChevronsUpDown} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {Popover,PopoverAnchor,PopoverContent,PopoverTrigger} from '../../components/ui/popover';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from '../../components/ui/command';
import {Input} from '../../components/ui/input';
import {useLocale} from '../../providers/locale-provider';
import {positionOptions,type PositionChoice,type RuleValue} from './staff-permissions-model';
import {cn} from '../../lib/utils';

export function PositionCombobox({id,value,positions,onChange,disabled=false}:{id?:string;value:PositionChoice|null;positions:readonly {id:string;name:string}[];onChange:(choice:PositionChoice)=>void;disabled?:boolean}){
 const th=useLocale()==='th';
 const [listId,setListId]=useState<string>();
 const listRef=useCallback((node:HTMLDivElement|null)=>{if(node)setListId(node.id);},[]);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const options=positionOptions(query,positions);
 const placeholder=th?'ค้นหาหรือพิมพ์ตำแหน่ง…':'Search or type a position…';
 const changeOpen=(next:boolean)=>{setOpen(next);if(!next)setQuery('');};
 const choose=(choice:PositionChoice)=>{onChange(choice);changeOpen(false);};
 return <Popover open={open} onOpenChange={changeOpen}>
  <PopoverTrigger asChild>
   <Button id={id} type="button" variant="outline" role="combobox" aria-label={th?'ตำแหน่ง':'Position'} aria-expanded={open} aria-haspopup="listbox" aria-controls={open?listId:undefined} disabled={disabled} className="w-full justify-between sm:max-w-sm" onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();changeOpen(true);}}}>
    <span className="truncate">{value?.name||placeholder}</span><ChevronsUpDown data-icon="inline-end"/>
   </Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
   <Command shouldFilter={false} label={placeholder}>
    <CommandInput autoFocus value={query} onValueChange={setQuery} placeholder={placeholder} aria-label={placeholder} maxLength={121}/>
    <CommandList ref={listRef} label={th?'ตำแหน่ง':'Positions'}>
     <CommandEmpty>{query.trim().length>120?(th?'ชื่อตำแหน่งต้องไม่เกิน 120 ตัวอักษร':'Position names must be 120 characters or fewer'):(th?'ไม่พบตำแหน่ง พิมพ์ชื่อเพื่อสร้างใหม่':'No positions found. Type a name to create one.')}</CommandEmpty>
     <CommandGroup heading={th?'ตำแหน่ง':'Positions'}>
      {options.map(choice=><CommandItem key={choice.kind==='existing'?choice.id:'create'} value={choice.kind==='existing'?'existing:'+choice.id:'create:'+choice.name} data-checked={choice.kind==='existing'&&value?.kind==='existing'&&choice.id===value.id} onSelect={()=>choose(choice)}>
       {choice.kind==='existing'?choice.name:(th?`สร้างตำแหน่ง “${choice.name}”`:`Create position “${choice.name}”`)}
      </CommandItem>)}
     </CommandGroup>
    </CommandList>
   </Command>
  </PopoverContent>
 </Popover>;
}

export interface FreeformPositionComboboxProps {
  id?: string;
  value: string;
  positions: readonly { id: string; name: string; rules?: Record<string, RuleValue> }[];
  onChange: (value: string) => void;
  onSelectPreset?: (preset: { id: string; name: string; rules?: Record<string, RuleValue> }) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function FreeformPositionCombobox({
  id,
  value,
  positions,
  onChange,
  onSelectPreset,
  disabled = false,
  placeholder,
  className,
}: FreeformPositionComboboxProps) {
  const th = useLocale() === 'th';
  const [open, setOpen] = useState(false);
  const effectivePlaceholder = placeholder ?? (th ? 'ค้นหาหรือพิมพ์ตำแหน่ง…' : 'Search or type a position…');

  const term = (value || '').trim().normalize('NFC').toLocaleLowerCase();
  const filtered = term
    ? positions.filter((pos) =>
        pos.name.trim().normalize('NFC').toLocaleLowerCase().includes(term)
      )
    : positions;
  const matching = filtered.length > 0 ? filtered : positions;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn('relative flex items-center w-full', className)}>
          <Input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={effectivePlaceholder}
            className="pr-10"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
              }
            }}
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={th ? 'เลือกตำแหน่ง' : 'Select position'}
              aria-expanded={open}
              aria-haspopup="listbox"
              className="absolute right-0 top-0 h-full w-9 p-0 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              <ChevronsUpDown className="size-4" data-icon="inline-end" />
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-anchor-width,var(--radix-popover-trigger-width))] min-w-[200px] p-0"
      >
        <Command shouldFilter={false} label={th ? 'ตำแหน่ง' : 'Positions'}>
          <CommandList label={th ? 'ตำแหน่ง' : 'Positions'}>
            <CommandEmpty>
              {positions.length === 0
                ? (th ? 'ไม่มีตำแหน่งในระบบ' : 'No positions available')
                : (th ? 'ไม่พบตำแหน่งที่ตรงกัน' : 'No matching positions')}
            </CommandEmpty>
            {matching.length > 0 && (
              <CommandGroup heading={th ? 'ตำแหน่ง' : 'Positions'}>
                {matching.map((pos) => (
                  <CommandItem
                    key={pos.id}
                    value={pos.name}
                    data-checked={pos.name.trim().normalize('NFC').toLocaleLowerCase() === term}
                    onSelect={() => {
                      onChange(pos.name);
                      onSelectPreset?.(pos);
                      setOpen(false);
                    }}
                  >
                    {pos.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
