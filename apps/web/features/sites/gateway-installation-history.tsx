'use client';
import {useSessionUser} from '../../providers/session-user-provider';
import {gatewayPermissions} from './gateway-permissions';
import {useEffect,useState,type FormEvent} from 'react';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {formatAppDateTime} from '../../lib/date-format';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {Field,FieldError,FieldGroup,FieldLabel} from '../../components/ui/field';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
import {DataTable} from '../../components/ui/data-table';

type Installation={id:string;gatewayId:string;name:string;externalGatewayId:string;installedAt:string;removedAt:string|null;replacedByGatewayId:string|null};

export function GatewayInstallationHistory({gatewayId,onReplaced}:{gatewayId:string;onReplaced:()=>void}){
  const locale=useLocale(),th=locale==='th',permissions=gatewayPermissions(useSessionUser());
  const [rows,setRows]=useState<Installation[]>([]);
  const [open,setOpen]=useState(false);
  const [name,setName]=useState('');
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [showErrors,setShowErrors]=useState(false);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    let active=true;
    apiClient.get<Installation[]>(`/v1/gateways/${gatewayId}/history`)
      .then(data=>{if(active)setRows(data);})
      .catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[gatewayId]);

  async function replace(e:FormEvent){
    e.preventDefault();
    if(!permissions.gatewayEdit)return;
    setShowErrors(true);
    if(!name.trim()) return;
    setBusy(true);
    setError('');
    try{
      await apiClient.post(`/v1/gateways/${gatewayId}/replace`,{name:name.trim(),externalGatewayId:code.trim()||undefined});
      setOpen(false);
      onReplaced();
    }catch(e){
      setError((e as Error).message);
    }finally{
      setBusy(false);
    }
  }

  const nameInvalid = showErrors && !name.trim();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm">{th?'ประวัติเกตเวย์ของไซต์':'Site gateway history'}</h2>
        {permissions.gatewayEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setName('');
              setCode('');
              setError('');
              setShowErrors(false);
              setOpen(true);
            }}
          >
            {th?'เปลี่ยนเกตเวย์ของไซต์':'Replace site gateway'}
          </Button>
        )}
      </div>

      <DataTable
        variant="embedded"
        hideSearch
        data={rows}
        getRowId={row=>row.id}
        columns={[
          {accessorKey:'name',header:th?'เกตเวย์':'Gateway'},
          {accessorKey:'externalGatewayId',header:th?'รหัส':'Code'},
          {accessorKey:'installedAt',header:th?'ติดตั้งเมื่อ':'Installed',cell:({row})=>formatAppDateTime(row.original.installedAt,locale)},
          {accessorKey:'removedAt',header:th?'ถอดเมื่อ':'Removed',cell:({row})=>row.original.removedAt?formatAppDateTime(row.original.removedAt,locale):(th?'ใช้งานอยู่':'Active')},
        ]}
      />

      {error && !open && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{th?'เปลี่ยนเกตเวย์ของไซต์':'Replace site gateway'}</DialogTitle>
            <DialogDescription>
              {th
                ? 'เกตเวย์เดิมจะถูกถอนจากไซต์ โดยเก็บประวัติอุปกรณ์และการตั้งค่า'
                : 'The current gateway will be removed from this site, preserving device and configuration history.'}
            </DialogDescription>
          </DialogHeader>

          <form id="replace-gateway-form" noValidate onSubmit={replace} data-slot="dialog-body" className="min-h-0 flex-1 overflow-y-auto py-2 px-1 space-y-4">
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <FieldGroup className="space-y-3">
              <Field data-invalid={nameInvalid || undefined}>
                <FieldLabel htmlFor="replacement-name">{th?'ชื่อเกตเวย์ใหม่':'New gateway name'}</FieldLabel>
                <Input
                  id="replacement-name"
                  required
                  aria-invalid={nameInvalid || undefined}
                  value={name}
                  onChange={e=>setName(e.target.value)}
                />
                {nameInvalid && (
                  <FieldError className="text-xs">
                    {th ? 'กรุณาระบุชื่อเกตเวย์ใหม่' : 'New gateway name is required'}
                  </FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="replacement-code">{th?'รหัสเกตเวย์ใหม่':'New gateway code'}</FieldLabel>
                <Input
                  id="replacement-code"
                  value={code}
                  placeholder={th?'สร้างให้อัตโนมัติ':'Generated automatically'}
                  onChange={e=>setCode(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter className="flex flex-row items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              {th?'ยกเลิก':'Cancel'}
            </Button>
            <Button type="submit" form="replace-gateway-form" size="sm" disabled={busy}>
              {busy ? (th?'กำลังบันทึก…':'Saving…') : (th?'ยืนยันเปลี่ยนเกตเวย์':'Confirm replacement')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

