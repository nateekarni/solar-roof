"use client";

import * as React from "react";
import {Alert,AlertDescription,AlertTitle} from "../../components/ui/alert";
import {Badge} from "../../components/ui/badge";
import {Button} from "../../components/ui/button";
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from "../../components/ui/card";
import {Checkbox} from "../../components/ui/checkbox";
import {Field,FieldGroup,FieldLabel,FieldDescription} from "../../components/ui/field";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from "../../components/ui/select";
import {Textarea} from "../../components/ui/textarea";
import {buildBillingSourceInput,type BillingSourceDraft,type BillingSourceState,type MeasurementPurpose} from "./billing-source-model";

const purposeLabels:Record<MeasurementPurpose,[string,string]>={
 "solar-delivered":["พลังงานโซลาร์ที่ส่งมอบให้ลูกค้า","Solar energy delivered to customer"],
 "grid-import":["พลังงานที่รับจากโครงข่าย","Grid import"],
 "facility-consumption":["การใช้พลังงานรวมของสถานที่","Total facility consumption"],
 "other":["อื่น ๆ (ระบุ)","Other (describe)"]
};
const statuses:Record<BillingSourceState["status"],[string,string,string,string]>={
 unbound:["ยังไม่ผูกแหล่งข้อมูล","Not bound","เลือกฟิลด์สะสมและวัตถุประสงค์ทางกายภาพ แล้วบันทึกแหล่งข้อมูลก่อนคำนวณบิล","Select the cumulative field and physical purpose, then save the source before calculating bills."],
 "profile-changed":["Profile เปลี่ยนแล้ว","Profile changed","ยืนยันการผูกแหล่งข้อมูลใหม่กับ Profile ปัจจุบัน แหล่งข้อมูลเดิมยังคงอยู่จนกว่าจะยืนยัน","Confirm a replacement for the current profile. The previous binding stays active until you explicitly replace it."],
 verified:["มีข้อมูลสะสมที่ตรวจสอบแล้ว","Verified cumulative reading","การคำนวณยังต้องใช้ข้อมูลที่ถูกต้องครบทั้งต้นงวดและปลายงวดตามสัญญา","Calculation still requires valid opening and closing readings for the contract period."],
 "invalid-data":["ข้อมูลต้นทางไม่ถูกต้อง","Invalid source data","ตรวจสอบหน่วย คุณภาพ และค่าต้นทาง ส่งข้อมูลจริงที่ถูกต้องก่อนคำนวณบิล","Check source units, quality and counter values. Send valid actual readings before calculating bills."],
 "waiting-for-reading":["รอข้อมูลจริง","Waiting for actual reading","ตั้งค่าแหล่งข้อมูลแล้ว ส่งข้อมูลสะสมจริงจากมิเตอร์ที่ผูกไว้ก่อนคำนวณบิล","Source configured. Send an actual cumulative reading from the bound meter before calculating bills."],
 "ambiguous-meter":["พบมิเตอร์หลักมากกว่าหนึ่งตัว","Ambiguous main meter","แก้ไขการกำหนดมิเตอร์หลักให้เหลือหนึ่งตัวก่อนผูกแหล่งข้อมูล","Resolve the main meter configuration to exactly one meter before binding."],
 "no-main-meter":["ไม่มีมิเตอร์หลัก","No main meter","บันทึกมิเตอร์หลักพร้อมฟิลด์พลังงานสะสมที่ถูกต้องก่อนผูกแหล่งข้อมูล","Configure the main meter with a valid cumulative energy field before binding."]
};
export interface BillingSourcePanelProps {
 state:BillingSourceState;draft:BillingSourceDraft;onChange:(value:BillingSourceDraft)=>void;
 onSave:()=>void;onReload:()=>void;locale:"en"|"th";profilePending?:boolean;busy?:boolean;error?:string;notice?:string;sourcePath?:string;
}
export function BillingSourcePanel({state,draft,onChange,onSave,onReload,locale,profilePending=false,busy=false,error,notice,sourcePath}:BillingSourcePanelProps){
 const th=locale==="th",label=(thai:string,english:string)=>th?thai:english;
 const id=React.useId(),field=state.eligibleFields.find(f=>f.sourceTag===draft.sourceTag)??(state.eligibleFields.length===1?state.eligibleFields[0]:undefined);
 const bound=state.binding,reading=state.latestVerifiedReading,status=statuses[state.status];
 let canSave=false;try{buildBillingSourceInput(state,draft,profilePending);canSave=true;}catch{}
 const change=(patch:Partial<BillingSourceDraft>)=>onChange({...draft,...patch,confirmed:false});
 const details:Array<[string,React.ReactNode]>=[
 [label("มิเตอร์หลัก","Main meter"),state.device?.name??"—"],["Device ID",state.device?.externalDeviceId??"—"],
 [label("Profile ปัจจุบัน","Current profile"),state.device?.profileRevisionId??"—"],
 [label("ฟิลด์ต้นทาง","Source tag"),field?.sourceTag??bound?.sourceTag??"—"],
 ["Canonical tag",field?.canonicalTag??bound?.canonicalTag??"—"],
 [label("ตำแหน่งค่าต้นทาง","Source path"),field?sourcePath??`data.values[${JSON.stringify(field.sourceTag)}]`:"—"],
 ["Poll group",field?.pollGroup??"—"],
 [label("หน่วยต้นทาง","Source unit"),field?.sourceUnit??bound?.sourceUnit??"—"],
 [label("หน่วยปลายทาง","Target unit"),field?.targetUnit??bound?.targetUnit??"—"],
 [label("การแปลงค่า","Conversion"),field?.conversion??bound?.conversion??"—"]
 ];
 return <Card className="min-w-0" id="site-billing-source" tabIndex={-1}>
  <CardHeader className="pt-5 pb-4"><CardTitle>{label("แหล่งข้อมูลสำหรับคำนวณบิล","Billing source")}</CardTitle><CardDescription>{label("เลือกแหล่งพลังงานสะสมและความหมายตามการติดตั้งจริง","Select the cumulative energy source and its physical installation purpose.")}</CardDescription></CardHeader>
  <CardContent className="flex min-w-0 flex-col gap-4">
   <Alert variant={state.status==="invalid-data"?"destructive":"default"}><AlertTitle><Badge variant="outline">{th?status[0]:status[1]}</Badge></AlertTitle><AlertDescription>{th?status[2]:status[3]}</AlertDescription></Alert>
   {notice&&<Alert><AlertDescription>{notice}</AlertDescription></Alert>}
   {profilePending&&<Alert><AlertTitle>{label("บันทึก Profile ก่อนผูกแหล่งข้อมูล","Apply the main meter profile before binding")}</AlertTitle><AlertDescription>{label("มีการแก้ไขมิเตอร์หลักที่ยังไม่ได้บันทึก หรือกำลังเปิดใช้ Profile ใหม่","The main meter has unsaved changes or a profile activation is in progress.")}</AlertDescription></Alert>}
   {!draft.sourceTag&&field&&<p className="text-sm text-muted-foreground">{label("ฟิลด์สะสมที่ตั้งค่าไว้ — เลือกฟิลด์ด้านล่างเพื่อผูกแหล่งข้อมูล","Configured cumulative field — choose below to bind it")}</p>}<dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">{details.map(([title,value])=><div key={title} className="min-w-0"><dt className="text-muted-foreground">{title}</dt><dd className="mt-1 break-all">{value}</dd></div>)}</dl>
   {bound&&<details><summary className="cursor-pointer text-sm">{label("แหล่งข้อมูลที่บันทึกอยู่","Saved binding")}</summary><dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">{[
    ["Binding ID",bound.id],["Profile",bound.profileRevisionId],["Source tag",bound.sourceTag],["Canonical tag",bound.canonicalTag],["Units",`${bound.sourceUnit} → ${bound.targetUnit}`],["Conversion",bound.conversion],
    [label("วัตถุประสงค์ที่บันทึก","Saved physical purpose"),purposeLabels[bound.measurementPurpose][th?0:1]],[label("รายละเอียด","Description"),bound.purposeDescription??"—"]
   ].map(([title,value])=><div key={title}><dt className="text-muted-foreground">{title}</dt><dd className="break-all">{value}</dd></div>)}</dl></details>}
   <section className="flex flex-col gap-2 rounded-lg bg-muted p-3" aria-label={label("ค่าพลังงานจริง","Actual energy reading")}>
    <p>{label("พลังงานสะสมล่าสุดที่ตรวจสอบแล้ว","Latest verified cumulative energy")}: <strong>{reading?new Intl.NumberFormat(locale,{maximumFractionDigits:6}).format(Number(reading.valueKwh))+" kWh":label("ยังไม่มีข้อมูลที่ตรวจสอบแล้ว","No verified reading")}</strong></p>
    {reading&&<><p>{label("คุณภาพ","Quality")}: {reading.quality} · {reading.fresh?label("ข้อมูลล่าสุด (ไม่ยืนยันสถานะออนไลน์)","Recent reading (does not establish online status)"):label("ข้อมูลย้อนหลัง (ไม่ยืนยันสถานะออนไลน์)","Historical reading (does not establish online status)")}</p><p>{label("เวลาวัด","Source time")}: {new Date(reading.sourceTime).toLocaleString(locale)} · {label("เวลารับ","Received time")}: {new Date(reading.receivedTime).toLocaleString(locale)}</p><p className="break-all">Reading ID: {reading.id} · Profile: {reading.profileRevisionId} · Binding: {reading.bindingId}</p></>}
    <p>{label("พลังงานใช้ในงวด = kWh ปลายงวด − kWh ต้นงวด; จำนวนเงิน = พลังงานใช้ในงวด × อัตราตามสัญญา","Period energy = closing kWh − opening kWh; amount = period energy × contract rate")}</p>
    <p className="text-muted-foreground">{label("ข้อมูลจริงที่ขาดหรือไม่ถูกต้องจะหยุดการคำนวณบิล แต่ยังบันทึกการตั้งค่าไซต์และอุปกรณ์ได้","Missing or invalid actual readings block billing calculation. Site and device configuration can still be saved.")}</p>
   </section>
   <FieldDescription>{label("แหล่งข้อมูลที่บันทึกมีผลกับข้อมูลที่รับใหม่เท่านั้น ข้อมูลและเอกสารที่บันทึกแล้วคงเดิม","A saved source applies to newly ingested readings only. Existing readings and documents stay unchanged.")}</FieldDescription><FieldGroup>
    <Field data-disabled={busy||profilePending}><FieldLabel htmlFor={id+"-source"}>{label("เลือกฟิลด์พลังงานสะสม","Select cumulative field")}</FieldLabel>
     <Select value={draft.sourceTag} onValueChange={sourceTag=>change({sourceTag})} disabled={busy||profilePending||state.eligibleFields.length!==1}><SelectTrigger aria-required id={id+"-source"} className="w-full"><SelectValue placeholder={label("เลือกฟิลด์จากมิเตอร์หลัก","Choose a main meter field")}/></SelectTrigger><SelectContent><SelectGroup>{state.eligibleFields.map(f=><SelectItem key={f.sourceTag??f.tag} value={f.sourceTag??f.tag}>{f.displayName} · {f.sourceTag??f.tag} · {f.sourceUnit} → {f.targetUnit}</SelectItem>)}</SelectGroup></SelectContent></Select>
     <FieldDescription>{label("การกำหนดหน้าที่ฟิลด์ใน Profile ยังไม่ใช่การผูกแหล่งข้อมูลบิล","A cumulative field role in a profile does not create a billing binding.")}</FieldDescription>
    </Field>
    <Field data-disabled={busy||profilePending}><FieldLabel htmlFor={id+"-purpose"}>{label("วัตถุประสงค์ทางกายภาพของมิเตอร์","Physical measurement purpose")}</FieldLabel>
     <Select name="billing-source-purpose" value={draft.measurementPurpose} onValueChange={value=>change({measurementPurpose:value as MeasurementPurpose})} disabled={busy||profilePending}><SelectTrigger aria-required id={id+"-purpose"} className="w-full"><SelectValue placeholder={label("เลือกตามการติดตั้งจริง","Choose based on the actual installation")}/></SelectTrigger><SelectContent><SelectGroup>{Object.entries(purposeLabels).map(([purpose,labels])=><SelectItem key={purpose} value={purpose}>{labels[th?0:1]}</SelectItem>)}</SelectGroup></SelectContent></Select>
    </Field>
    {draft.measurementPurpose==="other"&&<Field data-invalid={!draft.purposeDescription.trim()}><FieldLabel htmlFor={id+"-description"}>{label("รายละเอียดวัตถุประสงค์","Purpose description")}</FieldLabel><Textarea id={id+"-description"} maxLength={1000} value={draft.purposeDescription} aria-invalid={!draft.purposeDescription.trim()} disabled={busy||profilePending} onChange={event=>change({purposeDescription:event.target.value})}/></Field>}
    {bound&&<Field orientation="horizontal"><Checkbox id={id+"-confirm"} checked={draft.confirmed} disabled={busy||profilePending} onCheckedChange={checked=>onChange({...draft,confirmed:checked===true})}/><FieldLabel htmlFor={id+"-confirm"}>{label("ยืนยันการเปลี่ยนแหล่งข้อมูลบิล มีผลกับข้อมูลใหม่เท่านั้น ประวัติและเอกสารเดิมคงเดิม","I confirm the billing source change. It affects new data only; historical readings and documents stay unchanged.")}</FieldLabel></Field>}
   </FieldGroup>
   {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </CardContent>
  <CardFooter className="flex-wrap gap-2 py-4"><Button type="button" disabled={busy||!canSave} onClick={onSave}>{busy?label("กำลังบันทึก…","Saving…"):label("บันทึกแหล่งข้อมูลบิล","Save billing source")}</Button><Button type="button" variant="outline" disabled={busy} onClick={onReload}>{label("โหลดข้อมูลจริงใหม่","Reload actual data")}</Button></CardFooter>
 </Card>;
}
