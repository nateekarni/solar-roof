"use client";
import { sourceUnits, compatibleUnits, convertUnit, derivedConversion } from "@solar/api-contracts/unit-conversion";
import * as React from "react";
import { ChevronDown, Trash2, Code2, Table2, ListPlus } from "lucide-react";
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
import {Textarea} from "../../components/ui/textarea";
import {parsePayloadFieldsJson} from "./payload-fields-json";
import type { PayloadField } from "../sites/payload-contracts";

export function PayloadFieldsEditor({fields,onChange,onAdd,singleField=false,onValidityChange}:{fields:PayloadField[];onChange:(fields:PayloadField[])=>void;onAdd:()=>void;singleField?:boolean;onValidityChange?:(valid:boolean)=>void}) {
  const th=useLocale()==="th";
  const [view,setView]=React.useState("table");
  const [json,setJson]=React.useState(()=>JSON.stringify(fields,null,2)); const [jsonError,setJsonError]=React.useState(""); const lastFields=React.useRef(fields);
  React.useEffect(()=>{if(fields!==lastFields.current){lastFields.current=fields;setJson(JSON.stringify(fields,null,2));setJsonError("");onValidityChange?.(true);}},[fields,onValidityChange]);
  const changeJson=(value:string)=>{setJson(value);try{const parsed=parsePayloadFieldsJson(value,singleField);lastFields.current=parsed;onChange(parsed);setJsonError("");onValidityChange?.(true);}catch(error){setJsonError((error as Error).message);onValidityChange?.(false);}};
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
return <Tabs value={view} onValueChange={next=>{if(!jsonError||next==="code")setView(next);}}><section className="min-w-0 space-y-3" aria-labelledby="field-settings-heading">
<div className="flex flex-wrap items-center justify-between gap-3"><h3 id="field-settings-heading" className="text-base font-semibold">{th?"รายการข้อมูล":"Data fields"}</h3><TabsList aria-label={th?"มุมมองรายการข้อมูล":"Data fields view"}><TabsTrigger value="table" className="w-10" disabled={!!jsonError} aria-label={th?"มุมมองตาราง":"Table view"}><Table2 className="size-4"/></TabsTrigger><TabsTrigger value="code" className="w-10" aria-label={th?"มุมมองโค้ด JSON":"JSON code view"}><Code2 className="size-4"/></TabsTrigger></TabsList></div>
<TabsContent value="code"><Textarea aria-label={th?"รายการข้อมูล JSON":"Data fields JSON"} aria-invalid={!!jsonError} className="min-h-64 font-mono text-sm" value={json} onChange={event=>changeJson(event.target.value)}/>{jsonError&&<p role="alert" className="text-sm text-destructive">{jsonError}</p>}</TabsContent>
<TabsContent value="table"><div className="overflow-x-auto"><Table><TableHeader><TableRow>{[...labels,th?"การแปลง":"Conversion"].map(label=><TableHead key={label}>{label}</TableHead>)}{!singleField&&<TableHead className="w-16"/>}</TableRow></TableHeader><TableBody>{fields.map((f,index)=><TableRow key={index}>{keys.map((key,k)=><TableCell key={key}>{key==="sourceUnit"||key==="targetUnit"?<div className="min-w-32">{units(f,index,key)}</div>:<Input className="min-w-40" aria-label={`${labels[k]} ${index+1}`} placeholder={placeholders[key]} value={f[key]} onChange={event=>update(index,{[key]:event.target.value})}/>}</TableCell>)}<TableCell className="min-w-40">{conversion(f,index)}</TableCell>{!singleField&&<TableCell className="w-16">{remove(index)}</TableCell>}</TableRow>)}</TableBody></Table></div></TabsContent>{!singleField&&<AddButton variant="outline" disabled={!!jsonError} onClick={onAdd}>{th?"เพิ่มรายการข้อมูล":"Add data field"}</AddButton>}</section></Tabs>;
}
