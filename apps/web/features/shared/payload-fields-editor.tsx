"use client";
import { sourceUnits, compatibleUnits, convertUnit, derivedConversion } from "@solar/api-contracts/unit-conversion";
import * as React from "react";
import { ChevronDown, Trash2, Grid2X2, Table2, ListPlus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { AddButton } from "../../components/ui/add-button";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../../components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "../../components/ui/select";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "../../components/ui/table";
import { useLocale } from "../../providers/locale-provider";
import type { PayloadField } from "../sites/payload-contracts";

export function PayloadFieldsEditor({fields,onChange,onAdd,singleField=false}:{fields:PayloadField[];onChange:(fields:PayloadField[])=>void;onAdd:()=>void;singleField?:boolean}) {
  const th=useLocale()==="th";
  const [view,setView]=React.useState("cards");
  const keys=["tag","displayName","pollGroup","sourceUnit","targetUnit"] as const;
  const labels=th?["แท็กข้อมูล","ชื่อฟิลด์","กลุ่มการอ่านค่า","หน่วยต้นทาง","หน่วยปลายทาง"]:["Data tag","Field name","Poll group","Source unit","Target unit"];
  const placeholders={tag:"electrical.voltage.l1_n",displayName:th?"เช่น แรงดัน L1":"e.g. L1 voltage",pollGroup:"realtime"};
  const update=(index:number,patch:Partial<PayloadField>)=>onChange(fields.map((field,i)=>i===index?{...field,...patch}:field));
  const remove=(index:number)=><Button type="button" variant="ghost" size="icon" className="size-10 text-destructive hover:text-destructive hover:bg-destructive/10" aria-label={`${th?"ลบฟิลด์":"Remove field"} ${index+1}`} onClick={()=>onChange(fields.filter((_,i)=>i!==index))}><Trash2 className="size-4" /></Button>;
    const units=(f:PayloadField,index:number,key:"sourceUnit"|"targetUnit")=>{
    const options=key==="sourceUnit"?[...new Set([...sourceUnits,...(f.sourceUnit?[f.sourceUnit]:[])])]:compatibleUnits(f.sourceUnit);
    return <Select value={f[key]} disabled={key==="targetUnit"&&!f.sourceUnit} onValueChange={value=>{
      const source=key==="sourceUnit"?value:f.sourceUnit;
      const target=key==="targetUnit"?value:compatibleUnits(source).includes(f.targetUnit)?f.targetUnit:source;
      update(index,{sourceUnit:source,targetUnit:target,conversion:derivedConversion(source,target)});
    }}><SelectTrigger id={`field-${index}-${key}`} aria-label={`${key==="sourceUnit"?labels[3]:labels[4]} ${index+1}`} className="w-full"><SelectValue placeholder={th?"เลือกหน่วย":"Select unit"}/></SelectTrigger><SelectContent><SelectGroup>{options.map(unit=><SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectGroup></SelectContent></Select>;
  };
  const conversion=(f:PayloadField,index:number)=>{
    let preview=th?"เลือกหน่วยต้นทางและปลายทาง":"Select source and target units";
    if(f.sourceUnit&&f.targetUnit){try{const converted=convertUnit(1000,f.sourceUnit,f.targetUnit);preview=f.sourceUnit===f.targetUnit?(th?"ไม่แปลงค่า (หน่วยเดิม)":"Keep value (same unit)"):`1,000 ${f.sourceUnit} → ${converted.toLocaleString(th?"th":"en",{maximumFractionDigits:6})} ${f.targetUnit}`;}catch{preview=th?"หน่วยไม่สามารถแปลงกันได้":"Incompatible units";}}
    return <p id={`field-${index}-conversion`} className="flex min-h-10 items-center rounded-md bg-muted/50 px-3 py-2 text-sm" role="status">{preview}</p>;
  };
if(singleField&&fields[0]){const f=fields[0];return <FieldGroup className="grid gap-3 sm:grid-cols-2">{keys.map((key,k)=><Field key={key}><FieldLabel htmlFor={`field-0-${key}`}>{labels[k]}</FieldLabel>{key==='sourceUnit'||key==='targetUnit'?units(f,0,key):<Input id={`field-0-${key}`} placeholder={placeholders[key]} value={f[key]} onChange={e=>update(0,{[key]:e.target.value})}/>}</Field>)}<Field><FieldLabel>{th?'การแปลง':'Conversion'}</FieldLabel>{conversion(f,0)}</Field></FieldGroup>;}
if (fields.length === 0) return <section className="space-y-3" aria-labelledby="field-settings-heading"><h3 id="field-settings-heading" className="text-base font-semibold">{th?"การตั้งค่าฟิลด์":"Field settings"}</h3><div className="flex flex-col items-center gap-3 rounded-lg bg-muted/50 px-6 py-8 text-center"><ListPlus aria-hidden="true" className="size-8 text-muted-foreground"/><p className="text-sm text-muted-foreground">{th?"ยังไม่มีฟิลด์ เพิ่มฟิลด์เพื่อกำหนดการรับข้อมูล":"No fields yet. Add a field to configure incoming data."}</p><AddButton onClick={onAdd}>{th?"เพิ่มฟิลด์":"Add field"}</AddButton></div></section>;
  return <Tabs value={view} onValueChange={setView}><section className="min-w-0 space-y-3" aria-labelledby="field-settings-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="field-settings-heading" className="text-base font-semibold">{th?"การตั้งค่าฟิลด์":"Field settings"}</h3><TabsList className="h-10 group-data-horizontal/tabs:h-10" aria-label={th?"มุมมองรายการฟิลด์":"Field view"}><TabsTrigger value="cards" className="w-10" aria-label={th?"มุมมองการ์ด":"Card view"} title={th?"การ์ด":"Cards"}><Grid2X2 aria-hidden="true" className="size-4" /></TabsTrigger><TabsTrigger value="table" className="w-10" aria-label={th?"มุมมองตาราง":"Table view"} title={th?"ตาราง":"Table"}><Table2 aria-hidden="true" className="size-4" /></TabsTrigger></TabsList></div>
    <TabsContent value={view}>{view==="cards"?<div className="space-y-3">{fields.map((f,index)=><Collapsible key={index} defaultOpen><Card className="gap-0 py-0 overflow-hidden"><CardHeader className="flex flex-row items-center justify-between gap-3 py-3"><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start px-0 hover:bg-transparent" aria-label={`${th?"พับ/ขยายฟิลด์":"Toggle field"} ${index+1} ${f.displayName||f.tag}`}><CardTitle className="min-w-0 truncate text-sm" title={f.displayName||f.tag}>{th?"ฟิลด์":"Field"} {index+1}{(f.displayName||f.tag)?` · ${f.displayName||f.tag}`:""}</CardTitle></Button></CollapsibleTrigger><div className="flex shrink-0 items-center gap-1">{remove(index)}<CollapsibleTrigger asChild><Button type="button" size="icon" variant="ghost" className="group size-10" aria-label={`${th?"พับ/ขยายฟิลด์":"Toggle field"} ${index+1}`}><ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" /></Button></CollapsibleTrigger></div></CardHeader><CollapsibleContent><CardContent className="pb-4"><FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{keys.map((key,k)=><Field key={key}><FieldLabel htmlFor={`field-${index}-${key}`}>{labels[k]}</FieldLabel>{key==="sourceUnit"||key==="targetUnit"?units(f,index,key):<Input id={`field-${index}-${key}`} placeholder={placeholders[key]} value={f[key]} onChange={event=>update(index,{[key]:event.target.value})}/>}</Field>)}<Field><FieldLabel htmlFor={`field-${index}-conversion`}>{th?"การแปลง":"Conversion"}</FieldLabel>{conversion(f,index)}</Field></FieldGroup></CardContent></CollapsibleContent></Card></Collapsible>)}</div>:<div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50">{[...labels,th?"การแปลง":"Conversion"].map(label=><TableHead key={label}>{label}</TableHead>)}<TableHead className="w-16"/></TableRow></TableHeader><TableBody>{fields.map((f,index)=><TableRow key={index}>{keys.map((key,k)=><TableCell key={key}>{key==="sourceUnit"||key==="targetUnit"?<div className="min-w-32">{units(f,index,key)}</div>:<Input className="min-w-40" aria-label={`${labels[k]} ${index+1}`} placeholder={placeholders[key]} value={f[key]} onChange={event=>update(index,{[key]:event.target.value})}/>}</TableCell>)}<TableCell className="min-w-40">{conversion(f,index)}</TableCell><TableCell className="w-16">{remove(index)}</TableCell></TableRow>)}</TableBody></Table></div>}
    </TabsContent><AddButton variant="outline" onClick={onAdd}>{th?"เพิ่มฟิลด์":"Add field"}</AddButton>
  </section></Tabs>;
}
