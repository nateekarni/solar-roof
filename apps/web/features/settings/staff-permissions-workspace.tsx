'use client';
import {useEffect,useState,useMemo,type FormEvent} from 'react';
import {accountRoleLabel} from './account-presentation';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {useSessionUser} from '../../providers/session-user-provider';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {SearchInput} from '../../components/ui/search-input';
import {MoreHorizontal, Database, Building2} from 'lucide-react';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '../../components/ui/dropdown-menu';
import {Label} from '../../components/ui/label';
import {ChoiceSelect} from '../../components/ui/choice-select';
import {Checkbox} from '../../components/ui/checkbox';
import {PositionCombobox, FreeformPositionCombobox} from './position-combobox';
import {DataTable} from '../../components/ui/data-table';
import type {ColumnDef} from '@tanstack/react-table';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '../../components/ui/table';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../../components/ui/tabs';
import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription} from '../../components/ui/empty';
import {effectiveRule,domainOverrides,filterEmployees,filterPositions,staffDraftChanged,positionRulesChanged,canDismissStaffDialog,staffStatusLabel,employeePositionDraft,employeePositionLabel,isActionValidForResource,applyPositionPreset,buildInvitePayload,ACTIVE_DISPLAY_RESOURCES,resourceLabel,bundleSubPermissions,isArchivedInvitationStatus,maskPersonalEmail,maskPersonalPhone,type RuleValue,type PositionChoice} from './staff-permissions-model';
import {formatAppDateTime} from '../../lib/date-format';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../components/ui/dialog';
import {ConfirmDialog} from '../../components/feedback/confirm-action';
import {Badge} from '../../components/ui/badge';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '../../components/ui/tooltip';
import {RuleMatrix} from './rule-matrix';
import {SiteScopeTable} from './site-scope-table';
export {RuleMatrix} from './rule-matrix';
export {SiteScopeTable} from './site-scope-table';
export type Domain='business'|'technical';export type Scope={mode:'all'|'selected';siteIds:string[]};
export type Position={id:string;name:string;rules:Record<string,RuleValue>;revision:number};
export type EmployeeInvitationMetadata={
 id?:string|null;
 invitedAt?:string|null;
 expiresAt?:string|null;
 revokedAt?:string|null;
 deliveryStatus?:string|null;
 issuerId?:string|null;
 issuerName?:string|null;
 issuerEmail?:string|null;
};
export type Employee={id:string;email:string;phone?:string|null;displayName:string;avatarData?:string|null;role:string;status:string;revision:number;companyPositionId:string|null;companyPosition:string|null;grant:{positionId:string|null;overrides:Record<string,RuleValue>;scope:Scope}|null;invitation?:EmployeeInvitationMetadata|null};

export function DiscardConfirmDialog({
  open,
  onConfirm,
  onCancel,
  inline,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  inline?: boolean;
}) {
  const th = useLocale() === 'th';
  return (
    <ConfirmDialog
      open={open}
      {...(inline !== undefined ? { inline } : {})}
      onOpenChange={(val) => { if (!val) onCancel(); }}
      title={th ? 'ละทิ้งการเปลี่ยนแปลง?' : 'Discard changes?'}
      description={th ? 'ข้อมูลที่คุณแก้ไขยังไม่ได้บันทึก หากออกจากหน้านี้ข้อมูลจะสูญหาย' : 'You have unsaved changes. If you leave, these changes will be lost.'}
      cancelLabel={th ? 'แก้ไขต่อ' : 'Continue editing'}
      confirmLabel={th ? 'ละทิ้งข้อมูล' : 'Discard'}
      variant="destructive"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function EmployeeScopeBadgeList({
  siteNames,
  th = true,
  inline = false,
  open,
}: {
  siteNames: string[];
  th?: boolean;
  inline?: boolean;
  open?: boolean;
}) {
  if (siteNames.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (siteNames.length === 1) {
    return (
      <span className="block max-w-[200px] truncate" title={siteNames[0]}>
        {siteNames[0]}
      </span>
    );
  }
  return (
    <div className="flex max-w-[220px] items-center gap-1.5 min-w-0">
      <span className="truncate min-w-0 font-medium" title={siteNames[0]}>
        {siteNames[0]}
      </span>
      <TooltipProvider delayDuration={150}>
        <Tooltip {...(open !== undefined ? { open } : {})}>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="shrink-0 text-xs px-1.5 py-0 font-medium cursor-pointer rounded-full bg-primary/10 text-primary border-primary/25 hover:bg-primary/20 transition-colors"
            >
              +{siteNames.length - 1}
            </Badge>
          </TooltipTrigger>
          <TooltipContent
            variant="popover"
            side="top"
            align="center"
            inline={inline}
            className="w-72 max-w-xs p-3 shadow-xl border border-border"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-border/80">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Building2 className="size-4 text-primary shrink-0" />
                  <span>{th ? 'ขอบเขตไซต์งาน' : 'Assigned Sites'}</span>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {siteNames.length} {th ? 'ไซต์' : 'sites'}
                </span>
              </div>
              <ul className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
                {siteNames.map((name, i) => (
                  <li key={i} className="flex items-center gap-2 text-foreground/90 hover:text-foreground">
                    <span className="size-1.5 rounded-full bg-primary shrink-0" />
                    <span className="truncate" title={name}>{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function StaffPermissionsWorkspace(){
 const user=useSessionUser(),th=useLocale()==='th',domain:Domain=user.role==='owner'?'business':'technical';
 const [employees,setEmployees]=useState<Employee[]>([]),[positions,setPositions]=useState<Position[]>([]),[permissions,setPermissions]=useState<string[]>([]),[sites,setSites]=useState<{id:string;name:string}[]>([]),[selected,setSelected]=useState<Employee|null>(null),[viewingInvitation,setViewingInvitation]=useState<Employee|null>(null),[selectedPosition,setSelectedPosition]=useState<Position|null>(null),[deactivating,setDeactivating]=useState<Employee|null>(null),[cancellingInvite,setCancellingInvite]=useState<Employee|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setError('');Promise.all([apiClient.get<{employees:Employee[]}>(`/v1/team/employees?domain=${domain}`),apiClient.get<{positions:Position[]}>(`/v1/team/positions?domain=${domain}`),apiClient.get<{permissions:string[]}>(`/v1/team/catalog?domain=${domain}`),apiClient.get<{id:string;name:string}[]>(domain==='business'?'/v1/sites':'/v1/gateways/site-options?includeAssigned=true')]).then(([e,p,c,s])=>{if(active){setEmployees(e.employees);setPositions(p.positions);setPermissions(c.permissions);setSites(s);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[domain,revision]);
 const [inviting,setInviting]=useState(false),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[positionFilter,setPositionFilter]=useState('all');
 const [tab,setTab]=useState('employees'),[positionSearch,setPositionSearch]=useState(''),[positionUsage,setPositionUsage]=useState('all');
 const filteredPositions=filterPositions(positions,employees,positionSearch,positionUsage);
 const statusLabel=(status:string)=>staffStatusLabel(status,th?'th':'en');
 const statusBadge=(status:string)=><span className={status==='active'?'inline-flex rounded-full px-2 py-1 text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400':'inline-flex rounded-full px-2 py-1 text-xs bg-muted text-muted-foreground'}>{statusLabel(status)}</span>;
 async function reactivate(employee:Employee){try{await apiClient.post(`/v1/team/employees/${employee.id}/reactivate`,{});refresh();}catch(e){setError((e as Error).message);}}
 const employeeActions=(employee:Employee)=><EmployeeRowActions employee={employee} onEdit={emp=>setSelected(emp)} onViewInvitation={emp=>setViewingInvitation(emp)} onDeactivate={emp=>setDeactivating(emp)} onReactivate={emp=>void reactivate(emp)} onCancelInvite={emp=>setCancellingInvite(emp)}/>;
 const positionActions=(position:Position)=><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={(th?'การจัดการตำแหน่ง: ':'Position actions: ')+position.name}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setSelectedPosition(position)}>{th?'จัดการสิทธิ์':'Manage permissions'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
 const filtered=filterEmployees(employees,search,status,positionFilter);
 const refresh=()=>{setInviting(false);setSelected(null);setViewingInvitation(null);setSelectedPosition(null);setDeactivating(null);setCancellingInvite(null);setRevision(n=>n+1);window.dispatchEvent(new Event('permissions-updated'));};


  const renderEmployeeScope = (employee: Employee) => {
    if (['owner', 'admin'].includes(employee.role) || employee.grant?.scope.mode === 'all') {
      return <span className="text-muted-foreground">{th ? 'ทุกไซต์' : 'All sites'}</span>;
    }
    const siteIds = employee.grant?.scope.siteIds ?? [];
    if (!siteIds.length) {
      return <span className="text-muted-foreground">—</span>;
    }
    const siteNames = siteIds.map((id) => sites.find((s) => s.id === id)?.name ?? (th ? 'ไซต์ที่ไม่มีข้อมูล' : 'Unavailable site'));
    return <EmployeeScopeBadgeList siteNames={siteNames} th={th} />;
  };

const employeeColumns:ColumnDef<Employee>[]=[
 {accessorKey:'displayName',header:th?'พนักงาน':'Employee'}, {accessorKey:'email',header:th?'อีเมล':'Email'},
 {id:'position',accessorFn:e=>employeePositionLabel(e,positions),header:th?'ตำแหน่ง':'Position'},
 {id:'scope',header:th?'ขอบเขตไซต์':'Site scope',cell:({row})=>renderEmployeeScope(row.original)},
 {accessorKey:'status',header:th?'สถานะ':'Status',cell:({row})=>statusBadge(row.original.status)},
 {id:'actions',header:'',enableSorting:false,cell:({row})=>employeeActions(row.original)}];
  const positionColumns:ColumnDef<Position>[]=[{accessorKey:'name',header:th?'ตำแหน่ง':'Position'},{id:'employees',header:th?'พนักงาน':'Employees',accessorFn:p=>employees.filter(e=>e.companyPositionId===p.id||e.grant?.positionId===p.id).length},{id:'actions',header:'',enableSorting:false,cell:({row})=>positionActions(row.original)}];
  const staffTabsList = (
    <TabsList aria-label={th ? 'เลือกแท็บทีมงาน' : 'Staff team tabs'} className="h-auto w-full justify-start overflow-x-auto !bg-transparent bg-transparent p-0 gap-2 border-0 shadow-none">
      <TabsTrigger
        value="employees"
        className="shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none"
      >
        {th ? 'พนักงาน' : 'Employees'}
      </TabsTrigger>
      <TabsTrigger
        value="positions"
        className="shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none"
      >
        {th ? 'ตำแหน่งและสิทธิ์' : 'Positions and permissions'}
      </TabsTrigger>
    </TabsList>
  );
  return <main className="content space-y-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">{th?'ทีมงานและสิทธิ์':'Staff and permissions'}</h1><p className="text-sm text-muted-foreground">{domain==='business'?(th?'จัดการสิทธิ์ธุรกิจและขอบเขตไซต์งาน':'Manage business permissions and site scope'):(th?'จัดการสิทธิ์เทคนิคและขอบเขตไซต์งาน':'Manage technical permissions and site scope')}</p></div>{tab==='employees'?<Button onClick={()=>setInviting(true)}>{th?'เพิ่มพนักงาน':'Add employee'}</Button>:<Button onClick={()=>setSelectedPosition({id:'',name:'',rules:{},revision:0})}>{th?'เพิ่มตำแหน่ง':'Add position'}</Button>}</header>{inviting&&<StaffInvitation domain={domain} positions={positions} permissions={permissions} sites={sites} onSaved={refresh} onClose={()=>setInviting(false)}/>}{error&&<p role="alert">{error}</p>}<Tabs value={tab} onValueChange={setTab}><TabsContent value="employees" className="space-y-4"><div className="flex flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><SearchInput className="w-full sm:max-w-xs" aria-label={th?'ค้นหาพนักงาน':'Search employees'} placeholder={th?'ค้นหาพนักงาน':'Search employees'} value={search} onChange={e=>setSearch(e.target.value)}/><div className="flex flex-wrap gap-2 sm:ml-auto"><ChoiceSelect className="w-[160px] max-w-full" aria-label={th?'สถานะพนักงาน':'Employee status'} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{th?'ทุกสถานะ':'All statuses'}</option>{[...new Set(employees.map(employee=>employee.status))].sort().map(value=><option key={value} value={value}>{statusLabel(value)}</option>)}</ChoiceSelect><ChoiceSelect className="w-[220px] max-w-full" aria-label={th?'ตำแหน่งพนักงาน':'Employee position'} value={positionFilter} onChange={e=>setPositionFilter(e.target.value)}><option value="all">{th?'ทุกตำแหน่ง':'All positions'}</option><option value="unassigned">{th?'ไม่มีตำแหน่ง':'Unassigned'}</option>{positions.map(position=><option key={position.id} value={position.id}>{position.name}</option>)}</ChoiceSelect></div></div>{staffTabsList}</div><div className="hidden md:block"><DataTable columns={employeeColumns} data={filtered} getRowId={row=>row.id} hideSearch/></div><div className="space-y-3 md:hidden">{filtered.map(employee=><article key={employee.id} className="rounded-xl border bg-card p-4 space-y-2"><h2 className="font-medium">{employee.displayName}</h2><p className="break-all text-sm">{employee.email}</p><p className="text-sm">{employeePositionLabel(employee,positions)}</p>{statusBadge(employee.status)}<div className="text-sm">{renderEmployeeScope(employee)}</div>{employeeActions(employee)}</article>)}{!filtered.length&&<p className="rounded-xl border p-4">{th?'ไม่พบพนักงาน':'No employees found'}</p>}</div></TabsContent><TabsContent value="positions" className="space-y-4"><div className="flex flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><SearchInput className="w-full sm:max-w-xs" aria-label={th?'ค้นหาตำแหน่ง':'Search positions'} placeholder={th?'ค้นหาตำแหน่ง':'Search positions'} value={positionSearch} onChange={e=>setPositionSearch(e.target.value)}/><ChoiceSelect className="w-[200px] max-w-full sm:ml-auto" aria-label={th?'การใช้ตำแหน่ง':'Position assignment'} value={positionUsage} onChange={e=>setPositionUsage(e.target.value)}><option value="all">{th?'ทุกตำแหน่ง':'All positions'}</option><option value="assigned">{th?'มีพนักงานใช้':'Assigned'}</option><option value="unused">{th?'ยังไม่มีพนักงานใช้':'Unused'}</option></ChoiceSelect></div>{staffTabsList}</div><div className="hidden md:block"><DataTable columns={positionColumns} data={filteredPositions} getRowId={row=>row.id} hideSearch/></div><div className="space-y-3 md:hidden">{filteredPositions.map(position=><article key={position.id} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-medium">{position.name}</h2>{positionActions(position)}</div><p className="text-sm text-muted-foreground">{th?'พนักงาน':'Employees'}: {employees.filter(employee=>employee.companyPositionId===position.id||employee.grant?.positionId===position.id).length}</p></article>)}{!filteredPositions.length&&<p className="rounded-xl border p-4">{th?'ไม่พบตำแหน่ง':'No positions found'}</p>}</div></TabsContent></Tabs>{selected&&<EmployeeEditor key={selected.id+'-'+selected.revision} employee={selected} domain={domain} positions={positions} permissions={permissions} sites={sites} onSaved={refresh} onClose={()=>setSelected(null)} canDeactivate={['owner','admin'].includes(user.role)}/>}{viewingInvitation&&<InvitationDetailsDialog employee={viewingInvitation} domain={domain} positions={positions} permissions={permissions} sites={sites} onClose={()=>setViewingInvitation(null)}/>}{deactivating&&<DeactivateConfirmDialog employee={deactivating} onConfirm={refresh} onClose={()=>setDeactivating(null)}/>}{cancellingInvite&&<CancelInviteConfirmDialog employee={cancellingInvite} onConfirm={refresh} onClose={()=>setCancellingInvite(null)}/>}{selectedPosition&&<PositionEditor key={selectedPosition.id+'-'+selectedPosition.revision} position={selectedPosition} domain={domain} permissions={permissions} onSaved={refresh} onClose={()=>setSelectedPosition(null)}/>}</main>;
}

export function EmployeeRowActions({
  employee,
  onEdit,
  onViewInvitation,
  onDeactivate,
  onReactivate,
  onCancelInvite,
  inline = false,
}: {
  employee: Employee;
  onEdit?: (e: Employee) => void;
  onViewInvitation?: (e: Employee) => void;
  onDeactivate?: (e: Employee) => void;
  onReactivate?: (e: Employee) => void;
  onCancelInvite?: (e: Employee) => void;
  inline?: boolean;
}) {
  const th = useLocale() === 'th';
  const isArchivedInvitation = isArchivedInvitationStatus(employee.status);

  if (inline) {
    return (
      <div role="menu" aria-label={(th ? 'การจัดการพนักงาน: ' : 'Employee actions: ') + employee.displayName}>
        {isArchivedInvitation ? (
          <button type="button" role="menuitem" onClick={() => onViewInvitation?.(employee)}>
            {th ? 'ดูรายละเอียด' : 'View details'}
          </button>
        ) : (
          <>
            <button type="button" role="menuitem" onClick={() => onEdit?.(employee)}>
              {th ? 'แก้ไขข้อมูล' : 'Edit details'}
            </button>
            {employee.status === 'active' && (
              <button
                type="button"
                role="menuitem"
                className="text-destructive focus:text-destructive"
                onClick={() => onDeactivate?.(employee)}
              >
                {th ? 'ยกเลิกใช้งาน' : 'Deactivate'}
              </button>
            )}
            {employee.status === 'inactive' && (
              <button type="button" role="menuitem" onClick={() => onReactivate?.(employee)}>
                {th ? 'เปิดใช้งานอีกครั้ง' : 'Reactivate'}
              </button>
            )}
            {employee.status === 'invited' && (
              <button
                type="button"
                role="menuitem"
                className="text-destructive focus:text-destructive"
                onClick={() => onCancelInvite?.(employee)}
              >
                {th ? 'ยกเลิกคำเชิญ' : 'Cancel invitation'}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={(th ? 'การจัดการพนักงาน: ' : 'Employee actions: ') + employee.displayName}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isArchivedInvitation ? (
          <DropdownMenuItem onSelect={() => onViewInvitation?.(employee)}>
            {th ? 'ดูรายละเอียด' : 'View details'}
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => onEdit?.(employee)}>
              {th ? 'แก้ไขข้อมูล' : 'Edit details'}
            </DropdownMenuItem>
            {employee.status === 'active' && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeactivate?.(employee)}
              >
                {th ? 'ยกเลิกใช้งาน' : 'Deactivate'}
              </DropdownMenuItem>
            )}
            {employee.status === 'inactive' && (
              <DropdownMenuItem onSelect={() => onReactivate?.(employee)}>
                {th ? 'เปิดใช้งานอีกครั้ง' : 'Reactivate'}
              </DropdownMenuItem>
            )}
            {employee.status === 'invited' && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onCancelInvite?.(employee)}
              >
                {th ? 'ยกเลิกคำเชิญ' : 'Cancel invitation'}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InvitationDetailsDialog({
  employee,
  domain,
  positions,
  permissions,
  sites,
  onClose,
  inline = false,
}: {
  employee: Employee;
  domain: Domain;
  positions: Position[];
  permissions: string[];
  sites: { id: string; name: string }[];
  onClose: () => void;
  inline?: boolean;
}) {
  const th = useLocale() === 'th';
  const locale = th ? 'th' : 'en';
  const inv = employee.invitation;
  const invitedAtLabel = inv?.invitedAt ? formatAppDateTime(inv.invitedAt, locale) : '—';
  const endTimestamp =
    employee.status === 'cancelled'
      ? (inv?.revokedAt ?? inv?.expiresAt ?? null)
      : (inv?.expiresAt ?? null);
  const endTimestampLabel = endTimestamp ? formatAppDateTime(endTimestamp, locale) : '—';
  const inviterLabel = inv?.issuerName
    ? `${inv.issuerName}${inv.issuerEmail ? ` (${maskPersonalEmail(inv.issuerEmail)})` : ''}`
    : inv?.issuerEmail
    ? maskPersonalEmail(inv.issuerEmail)
    : '—';

  const maskedEmail = maskPersonalEmail(employee.email);
  const maskedPhone = maskPersonalPhone(employee.phone);
  const positionLabel = employeePositionLabel(employee, positions);

  const presetRules =
    positions.find((p) => p.id === (employee.grant?.positionId ?? employee.companyPositionId))?.rules ?? {};
  const overrides = employee.grant?.overrides ?? {};
  const scope = employee.grant?.scope ?? { mode: 'selected' as const, siteIds: [] };
  const siteNames =
    scope.mode === 'all'
      ? []
      : scope.siteIds.map(
          (id) => sites.find((s) => s.id === id)?.name ?? (th ? 'ไซต์ที่ไม่มีข้อมูล' : 'Unavailable site')
        );

  const content = (
    <>
      <DialogHeader className="px-6 pt-6 pb-2 pr-10 shrink-0">
        <DialogTitle>{th ? 'รายละเอียดคำเชิญ' : 'Invitation details'}</DialogTitle>
        <DialogDescription>
          {th
            ? 'ข้อมูลประวัติคำเชิญที่ยกเลิกหรือหมดอายุ (สำหรับอ้างอิงเท่านั้น ข้อมูลส่วนตัวถูกปกปิดตามมาตรฐานความปลอดภัย)'
            : 'Historical record for a cancelled or expired invitation (reference only; personal data is masked).'}
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
        {/* Invitation Metadata */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{th ? 'ข้อมูลการเชิญ' : 'Invitation metadata'}</h3>
          <div className="space-y-3 rounded-xl border bg-muted/15 p-4 text-sm">
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'สถานะคำเชิญ' : 'Invitation status'}</span>
              <div>
                <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {staffStatusLabel(employee.status, locale)}
                </span>
              </div>
            </div>
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'วันที่และเวลาที่เชิญ' : 'Invited date & time'}</span>
              <span className="font-medium">{invitedAtLabel}</span>
            </div>
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">
                {employee.status === 'cancelled'
                  ? th
                    ? 'วันที่และเวลาที่ยกเลิก'
                    : 'Cancelled date & time'
                  : th
                  ? 'วันที่และเวลาที่หมดอายุ'
                  : 'Expired date & time'}
              </span>
              <span className="font-medium">{endTimestampLabel}</span>
            </div>
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'ผู้เชิญ' : 'Invited by'}</span>
              <span className="font-medium break-words">{inviterLabel}</span>
            </div>
          </div>
        </section>

        {/* Entered Information */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{th ? 'ข้อมูลที่กรอก' : 'Entered information'}</h3>
          <div className="space-y-3 rounded-xl border p-4 text-sm">
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'ชื่อ-นามสกุล' : 'Full name'}</span>
              <span className="font-medium break-words">{employee.displayName || '—'}</span>
            </div>
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'อีเมล (ปกปิด)' : 'Email (masked)'}</span>
              <span className="font-mono text-sm font-medium break-all" data-testid="masked-email">
                {maskedEmail}
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'เบอร์โทรศัพท์ (ปกปิด)' : 'Phone (masked)'}</span>
              <span className="font-mono text-sm font-medium" data-testid="masked-phone">
                {maskedPhone}
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'บทบาท' : 'Role'}</span>
              <span className="font-medium">{accountRoleLabel(employee.role, locale)}</span>
            </div>
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'ตำแหน่ง' : 'Position'}</span>
              <span className="font-medium">{positionLabel}</span>
            </div>
            <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="text-muted-foreground">{th ? 'ขอบเขตไซต์งาน' : 'Site scope'}</span>
              <div>
                {scope.mode === 'all' ? (
                  <span className="font-medium">{th ? 'ทุกไซต์' : 'All sites'}</span>
                ) : siteNames.length > 0 ? (
                  <EmployeeScopeBadgeList siteNames={siteNames} th={th} inline={inline} {...(inline ? { open: true } : {})} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Configured Permissions */}
        {permissions.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">
              {th ? 'สิทธิ์การใช้งานที่กำหนดไว้' : 'Configured permissions'}
            </h3>
            <RuleMatrix
              domain={domain}
              permissions={permissions}
              rules={presetRules}
              overrides={overrides}
              disabled={true}
              onChange={() => {}}
            />
          </section>
        )}
      </div>

      <div className="shrink-0 border-t bg-muted/20 px-6 py-4 flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {th ? 'ปิด' : 'Close'}
        </Button>
      </div>
    </>
  );

  if (inline) {
    return (
      <Dialog open={true}>
        <section className="flex flex-col max-h-[88vh] min-w-0 overflow-hidden sm:max-w-3xl">
          {content}
        </section>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[88vh] p-0 gap-0 min-w-0 overflow-hidden sm:max-w-3xl">
        {content}
      </DialogContent>
    </Dialog>
  );
}

export function DeactivateConfirmDialog({
  employee,
  impact: initialImpact = null,
  onConfirm,
  onClose,
  inline = false,
}: {
  employee: Employee;
  impact?: { activeSessions: number; domains: { domain: string; scopeMode: string; siteIds: string[] }[] } | null;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  inline?: boolean;
}) {
  const th = useLocale() === 'th';
  const [impact, setImpact] = useState(initialImpact);
  const [loading, setLoading] = useState(!initialImpact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialImpact) return;
    let active = true;
    apiClient
      .get<{ activeSessions: number; domains: { domain: string; scopeMode: string; siteIds: string[] }[] }>(
        `/v1/team/employees/${employee.id}/deactivation-impact`
      )
      .then((res) => {
        if (active) {
          setImpact(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError((err as Error).message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [employee.id, initialImpact]);

  async function handleConfirm() {
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/v1/team/employees/${employee.id}/deactivate`, {
        revision: employee.revision,
        impactConfirmed: true,
      });
      await onConfirm();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      inline={inline}
      title={th ? 'ยืนยันยกเลิกใช้งานพนักงาน' : 'Confirm employee deactivation'}
      description={
        th
          ? `ยกเลิกการใช้งานสำหรับ ${employee.displayName} (${employee.email})`
          : `Deactivate account for ${employee.displayName} (${employee.email})`
      }
      confirmLabel={th ? 'ยืนยันยกเลิกใช้งาน' : 'Confirm deactivation'}
      cancelLabel={th ? 'ยกเลิก' : 'Cancel'}
      variant="destructive"
      busy={busy || loading}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-4 text-sm space-y-2">
        <p className="font-medium text-foreground">
          {th ? 'การปิดบัญชีจะถอนสิทธิ์ทั้งสองเขตและยุติเซสชัน' : 'Deactivation removes access across both domains and ends sessions'}: {impact?.activeSessions ?? 0}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </ConfirmDialog>
  );
}

export function CancelInviteConfirmDialog({
  employee,
  onConfirm,
  onClose,
  inline = false,
}: {
  employee: Employee;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  inline?: boolean;
}) {
  const th = useLocale() === 'th';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/v1/team/employees/${employee.id}/deactivate`, {
        revision: employee.revision,
        impactConfirmed: true,
      });
      await onConfirm();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      inline={inline}
      title={th ? 'ยกเลิกคำเชิญ' : 'Cancel invitation'}
      description={
        th
          ? `ยกเลิกคำเชิญสำหรับ ${employee.displayName} (${employee.email})?`
          : `Cancel invitation for ${employee.displayName} (${employee.email})?`
      }
      confirmLabel={th ? 'ยืนยันยกเลิกคำเชิญ' : 'Confirm cancellation'}
      cancelLabel={th ? 'ยกเลิก' : 'Cancel'}
      variant="destructive"
      busy={busy}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </ConfirmDialog>
  );
}

export function EmployeeEditor({employee,domain,positions,permissions,sites,onSaved,onClose,canDeactivate,inline=false,initialTab='general'}:{employee:Employee;domain:Domain;positions:Position[];permissions:string[];sites:{id:string;name:string}[];onSaved:()=>void;onClose:()=>void;canDeactivate:boolean;inline?:boolean;initialTab?:string}){
 const th=useLocale()==='th',builtInManager=['owner','admin'].includes(employee.role);
 const [name,setName]=useState(employee.displayName);
 const initialPosition=positions.find(position=>position.id===(employee.grant?.positionId??employee.companyPositionId));
 const initialChoice:PositionChoice|null=initialPosition?{kind:'existing',id:initialPosition.id,name:initialPosition.name}:employee.companyPosition?{kind:'new',name:employee.companyPosition}:null;
 const [positionText,setPositionText]=useState(employee.companyPosition||initialPosition?.name||'');
 const initialOverrides=useMemo<Record<string,RuleValue>>(()=>{
  const existingGrant=employee.grant;
  const initialPos=positions.find(p=>p.id===(existingGrant?.positionId??employee.companyPositionId));
  const initialRules=initialPos?.rules??{};
  const map:Record<string,RuleValue>={};
  for(const perm of permissions.filter(p=>p.startsWith(domain+'.'))){
    if(builtInManager){
      map[perm]=true;
    }else if(existingGrant?.overrides&&existingGrant.overrides[perm]!==undefined&&existingGrant.overrides[perm]!==null){
      map[perm]=existingGrant.overrides[perm];
    }else{
      map[perm]=initialRules[perm]===true;
    }
  }
  return map;
 },[builtInManager, domain, employee.companyPositionId, employee.grant, permissions, positions]);
 const [choice,setChoice]=useState<PositionChoice|null>(initialChoice),[draftRules,setDraftRules]=useState<Record<string,RuleValue>>({}),[overrides,setOverrides]=useState<Record<string,RuleValue>>(initialOverrides),[scope,setScope]=useState<Scope>(builtInManager?{mode:'all',siteIds:[]}:(employee.grant?.scope??{mode:'selected',siteIds:[]})),[error,setError]=useState(''),[busy,setBusy]=useState(false),[impact,setImpact]=useState<{activeSessions:number;domains:{domain:string;scopeMode:string;siteIds:string[]}[]}|null>(null);
 const [editorTab,setEditorTab]=useState(initialTab),[siteSearch,setSiteSearch]=useState(''),[discardOpen,setDiscardOpen]=useState(false);
 const [baseRevision,setBaseRevision]=useState(employee.revision),[currentPositions,setCurrentPositions]=useState(positions),[conflict,setConflict]=useState<'revision'|'position'|null>(null),[latest,setLatest]=useState<{employee:Employee;positions:Position[]}|null>(null);
 const [conflictingPositionId,setConflictingPositionId]=useState<string|null>(null);
 const positionKey=(value:PositionChoice|null)=>value?.kind==='existing'?value.id:value?'new:'+value.name:'';
 const dirty=name.trim()!==(employee.displayName??'').trim()||positionText.trim()!==(employee.companyPosition||initialPosition?.name||'').trim()||staffDraftChanged({positionId:positionKey(initialChoice),overrides:initialOverrides,scope:employee.grant?.scope??{mode:'selected',siteIds:[]}},{positionId:positionKey(choice),overrides,scope});
 const close=()=>{if(!busy){if(dirty)setDiscardOpen(true);else onClose();}};
 const rules=choice?.kind==='existing'?currentPositions.find(p=>p.id===choice.id)?.rules??{}:draftRules;
 const choosePreset=(pos:{id:string;name:string;rules?:Record<string,RuleValue>})=>{
  setPositionText(pos.name);
  setChoice({kind:'existing',id:pos.id,name:pos.name});
  const nextOverrides:Record<string,RuleValue>={...overrides};
  for(const p of permissions.filter(perm=>perm.startsWith(domain+'.'))){
    nextOverrides[p]=pos.rules?.[p]===true;
  }
  setOverrides(nextOverrides);
  setError('');
 };
 const handlePositionChange=(val:string)=>{
  setPositionText(val);
  const trimmed=val.trim();
  const match=currentPositions.find(p=>p.name.trim().toLocaleLowerCase()===trimmed.toLocaleLowerCase());
  if(match){
    setChoice({kind:'existing',id:match.id,name:match.name});
  }else if(trimmed){
    setChoice({kind:'new',name:trimmed});
  }else{
    setChoice(null);
  }
  setError('');
 };
 const goToPermissionsTab = () => {
  if (!name.trim()) {
    setError(th ? 'กรุณากรอกชื่อพนักงาน' : 'Employee name is required');
    return false;
  }
  setError('');
  setEditorTab('permissions');
  return true;
 };
 async function submitSave(){
  if (editorTab !== 'permissions') {
    return;
  }
  if(busy||conflict)return;
  setError('');
  if(!name.trim()){setEditorTab('general');setError(th?'กรุณากรอกชื่อพนักงาน':'Employee name is required');return;}
  if(!choice&&!positionText.trim()){setError(th?'กรุณาเลือกหรือระบุตำแหน่ง':'Choose or enter a position');return;}
  setBusy(true);
  try{
    const snapshotOverrides:Record<string,RuleValue>={};
    for(const p of permissions.filter(perm=>perm.startsWith(domain+'.'))){
      snapshotOverrides[p]=overrides[p]===true;
    }
    const effectiveChoice: PositionChoice | null = choice ?? (positionText.trim() ? { kind: 'new', name: positionText.trim() } : null);
    const result=await apiClient.patch<{success:true;revision:number;position:{id:string;name:string}}>(`/v1/team/employees/${employee.id}/${domain}`,employeePositionDraft({revision:baseRevision,choice:effectiveChoice,domain,permissions,rules,overrides:snapshotOverrides,scope,builtInManager,displayName:name.trim(),companyPosition:positionText.trim()}));
    if (result.position) setChoice({kind:'existing',id:result.position.id,name:result.position.name});
    onSaved();
  }catch(e){
    const failure=e as Error&{status?:number;code?:string;details?:{position?:{id?:string}}};
    setError(failure.message);
    if(failure.status===409){
      setConflict(failure.code==='POSITION_NAME_EXISTS'?'position':'revision');
      setLatest(null);
      setConflictingPositionId(typeof failure.details?.position?.id==='string'?failure.details.position.id:null);
    }
  }finally{
    setBusy(false);
  }
 }
 async function loadLatest(){if(busy)return;setBusy(true);setError('');try{const [employeesResponse,positionsResponse]=await Promise.all([apiClient.get<{employees:Employee[]}>(`/v1/team/employees?domain=${domain}`,{cache:'no-store'}),apiClient.get<{positions:Position[]}>(`/v1/team/positions?domain=${domain}`,{cache:'no-store'})]);const fresh=employeesResponse.employees.find(item=>item.id===employee.id);if(!fresh||fresh.role!==employee.role||fresh.status!==employee.status)throw new Error(th?'สถานะหรือบทบาทบัญชีเปลี่ยนแล้ว กรุณาปิดหน้าต่างและตรวจสอบทีมงาน':'Account status or role changed. Close this editor and review the team.');setLatest({employee:fresh,positions:positionsResponse.positions});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const duplicatePreset=(conflict==='position'||choice?.kind==='new')&&choice?latest?.positions.find(position=>conflictingPositionId?position.id===conflictingPositionId:position.name.trim().normalize('NFC').toLocaleLowerCase()===choice.name.trim().normalize('NFC').toLocaleLowerCase()):undefined;
 const reviewedDraftRules=duplicatePreset?.rules??(choice?.kind==='existing'?latest?.positions.find(position=>position.id===choice.id)?.rules??{}:draftRules);
 const reviewLatest=()=>{if(!latest||busy||conflict==='position'&&!duplicatePreset)return;setBaseRevision(latest.employee.revision);setCurrentPositions(latest.positions);if(duplicatePreset)setChoice({kind:'existing',id:duplicatePreset.id,name:duplicatePreset.name});setConflict(null);setLatest(null);setError('');setImpact(null);};
 async function revoke(){setBusy(true);setError('');try{await apiClient.delete(`/v1/team/employees/${employee.id}/${domain}`,{headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:baseRevision})});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function deactivate(){setBusy(true);setError('');try{if(!impact)setImpact(await apiClient.get(`/v1/team/employees/${employee.id}/deactivation-impact`));else{await apiClient.post(`/v1/team/employees/${employee.id}/deactivate`,{revision:baseRevision,impactConfirmed:true});onSaved();}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const editorBody = (
  <>
   <form noValidate onSubmit={(e) => e.preventDefault()} className="min-w-0 space-y-5">
    <fieldset disabled={busy} className="min-w-0"><Tabs className="min-w-0" value={editorTab} onValueChange={setEditorTab}>
     <TabsList aria-label={th ? 'เลือกแท็บ' : 'Select tab'} className="h-auto w-full flex gap-2 !bg-transparent p-0 border-0 shadow-none">
      <TabsTrigger
        value="general"
        className="flex-1 rounded-lg border border-border bg-card px-3.5 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold shadow-none"
      >
        {th ? 'ข้อมูลทั่วไป' : 'General details'}
      </TabsTrigger>
      <TabsTrigger
        value="permissions"
        className="flex-1 rounded-lg border border-border bg-card px-3.5 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold shadow-none"
      >
        {th ? 'สิทธิ์การใช้งานและไซต์' : 'Permissions & site scope'}
      </TabsTrigger>
     </TabsList>
     <TabsContent value="general" className="min-w-0 space-y-6 pt-4">
      <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
       <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
        {employee.avatarData ? (
          <img src={employee.avatarData} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-xl">{name.trim().slice(0, 1) || employee.displayName.slice(0, 1) || '?'}</span>
        )}
       </div>
       <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
         <p className="break-words font-semibold">{name || employee.displayName}</p>
         <span className={employee.status === 'active' ? 'inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400' : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'}>
           {staffStatusLabel(employee.status, th ? 'th' : 'en')}
         </span>
        </div>
        <p className="mt-1 break-all text-sm text-muted-foreground">{employee.email}</p>
       </div>
      </div>
      <section className="min-w-0 space-y-3">
       <h3 className="text-sm font-semibold">{th ? 'ข้อมูลทั่วไป' : 'General details'}</h3>
       <div className="space-y-4 rounded-xl border p-4">
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
         <Label htmlFor="edit-staff-name" className="text-sm text-muted-foreground">{th ? 'ชื่อ' : 'Name'}</Label>
         <Input
           id="edit-staff-name"
           name="staff-display-name"
           value={name}
           onChange={e => setName(e.target.value)}
           onKeyDown={(e) => {
             if (e.key === 'Enter') {
               e.preventDefault();
               e.stopPropagation();
               goToPermissionsTab();
             }
           }}
           required
         />
        </div>
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
         <span className="text-sm text-muted-foreground">{th ? 'อีเมล' : 'Email'}</span>
         <span className="min-w-0 break-words text-sm font-medium">{employee.email}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
         <span className="text-sm text-muted-foreground">{th ? 'บทบาท' : 'Role'}</span>
         <span className="min-w-0 break-words text-sm font-medium">{accountRoleLabel(employee.role, th ? 'th' : 'en')}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
         <Label htmlFor="edit-staff-position" className="text-sm text-muted-foreground">{th ? 'ตำแหน่ง' : 'Position'}</Label>
         <FreeformPositionCombobox
          id="edit-staff-position"
          value={positionText}
          positions={currentPositions}
          onChange={handlePositionChange}
          onSelectPreset={choosePreset}
          disabled={busy||!!conflict}
         />
        </div>
       </div>
      </section>
     </TabsContent>
     <TabsContent value="permissions" className="min-w-0 space-y-6 pt-4">
      {builtInManager && (
       <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
        <p className="font-medium">
         {th
           ? 'สิทธิ์การใช้งานและขอบเขตไซต์ถูกกำหนดตามบทบาทผู้ดูแลระบบ/เจ้าของระบบ'
           : 'Access permissions and site scope are defined by the Administrator/Owner role.'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
         {th
           ? 'บทบาทนี้มีสิทธิ์เข้าถึงทุกฟังก์ชันและทุกไซต์งานในระบบโดยอัตโนมัติ (ไม่สามารถจำกัดสิทธิ์ได้)'
           : 'This role automatically has full access to all functions and sites in the domain.'}
        </p>
       </div>
      )}
      <section className="min-w-0 space-y-3">
       <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
         <h3 className="text-sm font-semibold">{th ? 'สิทธิ์การใช้งาน' : 'Access permissions'}</h3>
         {builtInManager && (
          <p className="mt-1 text-sm text-muted-foreground">
           {th ? 'สิทธิ์ทั้งหมดที่ได้รับตามบทบาทปัจจุบัน' : 'All permissions granted by the current role'}
          </p>
         )}
        </div>
        {!builtInManager && choice?.kind === 'existing' && (
         <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
           const pos = currentPositions.find((p) => p.id === choice.id);
           const nextOverrides: Record<string, RuleValue> = { ...overrides };
           for (const p of permissions.filter((perm) => perm.startsWith(domain + '.'))) {
             nextOverrides[p] = pos?.rules[p] === true;
           }
           setOverrides(nextOverrides);
          }}
         >
          {th ? 'คืนค่าตามตำแหน่ง' : 'Reset to position preset'}
         </Button>
        )}
       </div>
       <RuleMatrix
        domain={domain}
        permissions={permissions}
        rules={rules}
        overrides={overrides}
        disabled={builtInManager}
        onChange={(permission, value) => {
         setOverrides({ ...overrides, [permission]: value });
        }}
       />
      </section>
      <fieldset className="min-w-0 space-y-3" disabled={builtInManager}>
       <legend className="text-sm font-semibold">{th ? 'ขอบเขตข้อมูลของเขตนี้' : 'Data scope for this domain'}</legend>
       <div className="flex flex-wrap items-center justify-between gap-3">
        <ChoiceSelect
         className="w-full sm:w-auto min-w-[200px]"
         aria-label={th ? 'ขอบเขตไซต์' : 'Site scope'}
         value={builtInManager ? 'all' : scope.mode}
         disabled={builtInManager}
         onChange={(e) => setScope({ ...scope, mode: e.target.value as Scope['mode'] })}
        >
         <option value="all">{th ? 'ทุกไซต์' : 'All sites'}</option>
         <option value="selected">{th ? 'ไซต์ที่เลือก' : 'Selected sites'}</option>
        </ChoiceSelect>
        {!builtInManager && scope.mode === 'selected' && (
         <SearchInput
          className="w-full sm:w-72"
          aria-label={th ? 'ค้นหาไซต์' : 'Search sites'}
          placeholder={th ? 'ค้นหาไซต์' : 'Search sites'}
          value={siteSearch}
          onChange={(e) => setSiteSearch(e.target.value)}
         />
        )}
       </div>
       {!builtInManager && scope.mode === 'selected' && (
        <SiteScopeTable sites={sites} scope={scope} search={siteSearch} onSearch={setSiteSearch} onChange={setScope} hideSearch />
       )}
      </fieldset>
     </TabsContent>
    </Tabs></fieldset>
    {!builtInManager&&<section className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/[0.03] p-4">
     <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
       <h3 className="text-sm font-semibold">{th?'การเข้าถึงบัญชี':'Account access'}</h3>
       <p className="mt-1 text-xs text-muted-foreground">{th?'ถอนสิทธิ์ในเขตนี้ หรือดูผลกระทบก่อนปิดบัญชี':'Remove domain access or review the impact of closing this account.'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
       <Button type="button" variant="outline" className="text-destructive" disabled={busy||!!conflict||!employee.grant} onClick={()=>void revoke()}>{th?'ถอนสิทธิ์เขตนี้':'Revoke this domain'}</Button>
       {canDeactivate&&<Button type="button" variant="destructive" disabled={busy||!!conflict} onClick={()=>void deactivate()}>{impact?(th?'ยืนยันปิดบัญชีทั้งหมด':'Confirm account deactivation'):(th?'ตรวจผลกระทบการปิดบัญชี':'Preview account deactivation')}</Button>}
      </div>
     </div>
     {impact&&<div role="status" className="space-y-2 rounded-lg border border-destructive/20 bg-background p-3 text-sm">
      <p>{th?'การปิดบัญชีจะถอนสิทธิ์ทั้งสองเขตและยุติเซสชัน':'Deactivation removes access across both domains and ends sessions'}: {impact.activeSessions}</p>
      {impact.domains.map(item=><p key={item.domain} className="break-words text-muted-foreground">{item.domain==='business'?(th?'ธุรกิจ':'Business'):(th?'เทคนิค':'Technical')}: {item.scopeMode==='all'?(th?'ทุกไซต์':'All sites'):item.siteIds.map(id=>sites.find(site=>site.id===id)?.name??(th?'ไซต์ที่ไม่มีข้อมูล':'Unavailable site')).join(', ')}</p>)}
      <Button type="button" variant="ghost" disabled={busy} onClick={()=>setImpact(null)}>{th?'ยกเลิก':'Cancel'}</Button>
     </div>}
    </section>}
    {conflict&&<section className="flex flex-col gap-3 rounded-xl border p-4" aria-label={th?'แก้ไขข้อมูลที่เปลี่ยนแปลง':'Resolve changed information'}>
     <p>{conflict==='position'?(th?'มีตำแหน่งชื่อนี้แล้ว โหลดตำแหน่งที่มีอยู่และตรวจสอบสิทธิ์ก่อนบันทึก':'This position exists. Load and review its permissions before saving.'):(th?'ข้อมูลถูกเปลี่ยนโดยผู้ใช้อื่น ร่างของคุณยังอยู่ กรุณาโหลดและตรวจสอบข้อมูลล่าสุด':'Another user changed this information. Your draft is preserved. Load and review the latest data.')}</p>
     <Button type="button" variant="outline" disabled={busy} onClick={()=>void loadLatest()}>{th?'โหลดข้อมูลล่าสุดเพื่อตรวจสอบ':'Load latest information for review'}</Button>
     {latest&&<section role="region" aria-label={th?'ตรวจสอบข้อมูลล่าสุด':'Review latest information'} className="flex flex-col gap-3">
      <p>{th?'ตำแหน่งล่าสุด':'Latest company position'}: {employeePositionLabel(latest.employee,latest.positions)}</p>
      {duplicatePreset&&<p>{th?'ตำแหน่งที่มีอยู่':'Existing position'}: {duplicatePreset.name}</p>}
      {!builtInManager&&<>
       <p>{th?'สิทธิ์ที่บันทึกไว้ล่าสุด':'Latest saved permissions'}</p>
       <fieldset disabled><RuleMatrix domain={domain} permissions={permissions} rules={latest.positions.find(position=>position.id===latest.employee.grant?.positionId)?.rules??{}} overrides={latest.employee.grant?.overrides??{}} onChange={()=>{}}/></fieldset>
       <p>{th?'ขอบเขตไซต์ล่าสุด':'Latest site scope'}: {latest.employee.grant?.scope.mode==='all'?(th?'ทุกไซต์':'All sites'):latest.employee.grant?.scope.siteIds.map(id=>sites.find(site=>site.id===id)?.name??(th?'ไซต์ที่ไม่มีข้อมูล':'Unavailable site')).join(', ')||(th?'ไม่มีไซต์':'No sites')}</p>
       <p>{th?'สิทธิ์ของร่างเมื่อใช้ข้อมูลล่าสุด':'Draft permissions using the latest preset'}: {duplicatePreset?.name??choice?.name??'—'}</p>
       <fieldset disabled><RuleMatrix domain={domain} permissions={permissions} rules={reviewedDraftRules} overrides={overrides} onChange={()=>{}}/></fieldset>
       <p>{th?'ขอบเขตไซต์ของร่าง':'Draft site scope'}: {scope.mode==='all'?(th?'ทุกไซต์':'All sites'):scope.siteIds.map(id=>sites.find(site=>site.id===id)?.name??(th?'ไซต์ที่ไม่มีข้อมูล':'Unavailable site')).join(', ')||(th?'ไม่มีไซต์':'No sites')}</p>
      </>}
      <p>{th?'การยืนยันจะใช้ข้อมูลล่าสุดเป็นฐาน ร่างสิทธิ์และขอบเขตไซต์ของคุณยังอยู่ แล้วกดบันทึกอีกครั้ง':'Confirm to use the latest state as a base while retaining your draft permissions and site scope. Save explicitly afterward.'}</p>
      <Button type="button" disabled={busy||conflict==='position'&&!duplicatePreset} onClick={reviewLatest}>{th?'ยืนยันว่าได้ตรวจสอบข้อมูลล่าสุด':'Confirm latest information reviewed'}</Button>
     </section>}
    </section>}
    {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2 pt-4">
     <Button key="edit-cancel" type="button" variant="outline" disabled={busy} onClick={close}>{th?'ยกเลิก':'Cancel'}</Button>
     {editorTab === 'permissions' && (
      <Button
       key="edit-back"
       type="button"
       variant="outline"
       disabled={busy}
       onClick={() => {
        setError('');
        setEditorTab('general');
       }}
      >
       {th ? 'ย้อนกลับ' : 'Back'}
      </Button>
     )}
     {editorTab === 'general' ? (
      <Button
       key="edit-next"
       type="button"
       disabled={busy}
       onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        goToPermissionsTab();
       }}
      >
       {th ? 'ถัดไป' : 'Next'}
      </Button>
     ) : (
      <Button
       key="edit-save"
       type="button"
       disabled={busy || !!conflict}
       onClick={() => void submitSave()}
      >
       {th ? 'บันทึกข้อมูล' : 'Save details'}
      </Button>
     )}
    </div>
   </form>
   <DiscardConfirmDialog
    open={discardOpen}
    onConfirm={() => {
     setDiscardOpen(false);
     onClose();
    }}
    onCancel={() => setDiscardOpen(false)}
   />
  </>
 );
 if(inline){
  return (
   <Dialog open={true}>
    <div className="min-w-0 gap-5 overflow-x-hidden sm:max-w-5xl">
     <DialogHeader className="pr-8">
      <DialogTitle>{th?'แก้ไขข้อมูลพนักงาน':'Edit employee details'}</DialogTitle>
      <DialogDescription>{domain==='business'?(th?'สิทธิ์ธุรกิจ':'Business permissions'):(th?'สิทธิ์เทคนิค':'Technical permissions')}</DialogDescription>
     </DialogHeader>
     {editorBody}
    </div>
   </Dialog>
  );
 }
 return (
 <Dialog open onOpenChange={(open:boolean)=>{if(!open)close();}}>
  <DialogContent className="min-w-0 gap-5 overflow-x-hidden sm:max-w-5xl">
   <DialogHeader className="pr-8">
    <DialogTitle>{th?'แก้ไขข้อมูลพนักงาน':'Edit employee details'}</DialogTitle>
    <DialogDescription>{domain==='business'?(th?'สิทธิ์ธุรกิจ':'Business permissions'):(th?'สิทธิ์เทคนิค':'Technical permissions')}</DialogDescription>
   </DialogHeader>
   {editorBody}
  </DialogContent>
 </Dialog>
 );
}
function PositionEditor({position,domain,permissions,onSaved,onClose}:{position:Position;domain:Domain;permissions:string[];onSaved:()=>void;onClose:()=>void}){const th=useLocale()==='th';const [name,setName]=useState(position.name),[rules,setRules]=useState(position.rules),[error,setError]=useState(''),[busy,setBusy]=useState(false);const [discardOpen,setDiscardOpen]=useState(false);const dirty=name.trim()!==(position.name??'').trim()||positionRulesChanged(position.rules,rules);const close=()=>{if(!busy){if(dirty)setDiscardOpen(true);else onClose();}};async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const bundledRules=bundleSubPermissions(domain,rules);if(position.id)await apiClient.patch(`/v1/team/positions/${position.id}/${domain}`,{revision:position.revision,name,rules:domainOverrides(domain,bundledRules)});else await apiClient.post(`/v1/team/positions/${domain}`,{name,rules:domainOverrides(domain,bundledRules)});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}return (<><Dialog open onOpenChange={(open:boolean)=>{if(!open)close();}}><DialogContent className="sm:max-w-5xl"><DialogHeader><DialogTitle>{position.id?(th?'จัดการตำแหน่ง':'Manage position'):(th?'เพิ่มตำแหน่ง':'Add position')}</DialogTitle><DialogDescription>{th?'กำหนดสิทธิ์เริ่มต้นสำหรับตำแหน่งนี้':'Set default permissions for this position preset'}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><div className="space-y-2"><Label htmlFor="position-name">{th?'ชื่อตำแหน่ง':'Position name'}</Label><Input id="position-name" value={name} required readOnly={!!position.id} onChange={e=>setName(e.target.value)}/></div><div className="space-y-2"><Label>{th?'สิทธิ์เริ่มต้น':'Default permissions'}</Label><RuleMatrix domain={domain} permissions={permissions} rules={{}} overrides={rules} onChange={(permission,value)=>{setRules({...rules,[permission]:value});}}/></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>{th?'ยกเลิก':'Cancel'}</Button><Button type="submit" disabled={busy}>{position.id?(th?'บันทึกตำแหน่ง':'Save position'):(th?'เพิ่มตำแหน่ง':'Add position')}</Button></div></form></DialogContent></Dialog><DiscardConfirmDialog open={discardOpen} onConfirm={() => { setDiscardOpen(false); onClose(); }} onCancel={() => setDiscardOpen(false)} /></>);}
export function StaffInvitation({
  domain,
  positions,
  permissions,
  sites,
  onSaved,
  onClose,
  inline = false,
  initialTab = 'general',
}: {
  domain: Domain;
  positions: Position[];
  permissions: string[];
  sites: { id: string; name: string }[];
  onSaved: () => void;
  onClose: () => void;
  inline?: boolean;
  initialTab?: 'general' | 'permissions';
}) {
  const th = useLocale() === 'th';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [overrides, setOverrides] = useState<Record<string, RuleValue>>({});
  const [scope, setScope] = useState<Scope>({ mode: 'all', siteIds: [] });
  const [activeTab, setActiveTab] = useState<'general' | 'permissions'>(initialTab);
  const [siteSearch, setSiteSearch] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dirty = Boolean(
    email ||
    name ||
    position ||
    Object.values(overrides).some((v) => v === true) ||
    scope.mode === 'selected'
  );

  const close = () => {
    if (!busy) {
      if (dirty) {
        setDiscardOpen(true);
      } else {
        onClose();
      }
    }
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const goToPermissionsTab = () => {
    if (!name.trim()) {
      setError(th ? 'กรุณาระบุชื่อพนักงาน' : 'Please provide employee name');
      return false;
    }
    if (!email.trim()) {
      setError(th ? 'กรุณาระบุอีเมล' : 'Please provide email address');
      return false;
    }
    if (!emailRegex.test(email.trim())) {
      setError(th ? 'รูปแบบอีเมลไม่ถูกต้อง' : 'Invalid email address');
      return false;
    }
    setError('');
    setActiveTab('permissions');
    return true;
  };

  async function submitInvitation() {
    if (activeTab !== 'permissions') {
      return;
    }
    if (!name.trim() || !email.trim()) {
      setActiveTab('general');
      setError(th ? 'กรุณากรอกชื่อและอีเมล' : 'Name and email are required');
      return;
    }
    if (!emailRegex.test(email.trim())) {
      setActiveTab('general');
      setError(th ? 'รูปแบบอีเมลไม่ถูกต้อง' : 'Invalid email address');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = buildInvitePayload({
        email,
        name,
        position,
        domain,
        permissions,
        overrides,
        scope,
      });
      await apiClient.post('/v1/users/invite', payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const formContent = (
    <>
      <form noValidate onSubmit={(e) => e.preventDefault()} className="min-w-0 space-y-5">
      <fieldset disabled={busy} className="min-w-0">
        <Tabs className="min-w-0" value={activeTab} onValueChange={(val) => setActiveTab(val as 'general' | 'permissions')}>
          <TabsList aria-label={th ? 'เลือกแท็บ' : 'Select tab'} className="h-auto w-full flex gap-2 !bg-transparent p-0 border-0 shadow-none">
            <TabsTrigger
              value="general"
              className="flex-1 rounded-lg border border-border bg-card px-3.5 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold shadow-none"
            >
              {th ? 'ข้อมูลทั่วไป' : 'General details'}
            </TabsTrigger>
            <TabsTrigger
              value="permissions"
              className="flex-1 rounded-lg border border-border bg-card px-3.5 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold shadow-none"
            >
              {th ? 'สิทธิ์การใช้งานและไซต์' : 'Permissions & site scope'}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="min-w-0 space-y-6 pt-4">
            <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
                <span className="text-xl">{name.trim().slice(0, 1) || '?'}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{name.trim() || (th ? 'พนักงานใหม่' : 'New employee')}</p>
                <p className="mt-1 break-all text-sm text-muted-foreground">{email.trim() || (th ? 'ยังไม่ได้ระบุอีเมล' : 'No email provided')}</p>
              </div>
            </div>
            <section className="min-w-0 space-y-3">
              <h3 className="text-sm font-semibold">{th ? 'ข้อมูลทั่วไป' : 'General details'}</h3>
              <div className="space-y-4 rounded-xl border p-4">
                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <Label htmlFor="staff-name" className="text-sm text-muted-foreground">{th ? 'ชื่อ' : 'Name'}</Label>
                  <Input
                    id="staff-name"
                    value={name}
                    required
                    placeholder={th ? 'เช่น สมชาย ใจดี' : 'e.g. John Doe'}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        goToPermissionsTab();
                      }
                    }}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <Label htmlFor="staff-email" className="text-sm text-muted-foreground">{th ? 'อีเมล' : 'Email'}</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    value={email}
                    required
                    placeholder="user@example.com"
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        goToPermissionsTab();
                      }
                    }}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <Label htmlFor="staff-position" className="text-sm text-muted-foreground">{th ? 'ตำแหน่ง' : 'Position'}</Label>
                  <FreeformPositionCombobox
                    id="staff-position"
                    value={position}
                    positions={positions}
                    onChange={setPosition}
                    onSelectPreset={(pos) => {
                      setOverrides(applyPositionPreset(domain, permissions, pos.rules));
                    }}
                    placeholder={th ? 'ค้นหาหรือพิมพ์ตำแหน่ง…' : 'Search or type a position…'}
                  />
                </div>
              </div>
            </section>
          </TabsContent>
          <TabsContent value="permissions" className="min-w-0 space-y-6 pt-4">
            <section className="min-w-0 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{th ? 'สิทธิ์การใช้งาน' : 'Access permissions'}</h3>
              </div>
              <RuleMatrix
                domain={domain}
                permissions={permissions}
                rules={{}}
                overrides={overrides}
                onChange={(perm, val) => setOverrides({ ...overrides, [perm]: val })}
              />
            </section>
            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-semibold">{th ? 'ขอบเขตข้อมูลของเขตนี้' : 'Data scope for this domain'}</legend>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ChoiceSelect
                  className="w-full sm:w-auto min-w-[200px]"
                  aria-label={th ? 'ขอบเขตไซต์' : 'Site scope'}
                  value={scope.mode}
                  onChange={(e) => setScope({ ...scope, mode: e.target.value as Scope['mode'] })}
                >
                  <option value="all">{th ? 'ทุกไซต์' : 'All sites'}</option>
                  <option value="selected">{th ? 'ไซต์ที่เลือก' : 'Selected sites'}</option>
                </ChoiceSelect>
                {scope.mode === 'selected' && (
                  <SearchInput
                    className="w-full sm:w-72"
                    aria-label={th ? 'ค้นหาไซต์' : 'Search sites'}
                    placeholder={th ? 'ค้นหาไซต์' : 'Search sites'}
                    value={siteSearch}
                    onChange={(e) => setSiteSearch(e.target.value)}
                  />
                )}
              </div>
              {scope.mode === 'selected' && (
                <SiteScopeTable
                  sites={sites}
                  scope={scope}
                  search={siteSearch}
                  onSearch={setSiteSearch}
                  onChange={setScope}
                  hideSearch
                />
              )}
            </fieldset>
          </TabsContent>
        </Tabs>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-4">
        <Button key="invite-cancel" type="button" variant="outline" disabled={busy} onClick={close}>
          {th ? 'ยกเลิก' : 'Cancel'}
        </Button>
        {activeTab === 'permissions' && (
          <Button
            key="invite-back"
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError('');
              setActiveTab('general');
            }}
          >
            {th ? 'ย้อนกลับ' : 'Back'}
          </Button>
        )}
        {activeTab === 'general' ? (
          <Button
            key="invite-next"
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goToPermissionsTab();
            }}
          >
            {th ? 'ถัดไป' : 'Next'}
          </Button>
        ) : (
          <Button
            key="invite-submit"
            type="button"
            disabled={busy}
            onClick={() => void submitInvitation()}
          >
            {th ? 'ส่งคำเชิญ' : 'Send invitation'}
          </Button>
        )}
      </div>
    </form>
    <DiscardConfirmDialog
      open={discardOpen}
      onConfirm={() => {
        setDiscardOpen(false);
        onClose();
      }}
      onCancel={() => setDiscardOpen(false)}
    />
  </>
  );

  if (inline) {
    return (
      <Dialog open={true}>
        <section className="min-w-0 gap-5 overflow-x-hidden sm:max-w-5xl">
          <DialogHeader className="pr-8">
            <DialogTitle>{th ? 'เพิ่มพนักงาน' : 'Add employee'}</DialogTitle>
            <DialogDescription>
              {th
                ? 'ส่งคำเชิญและกำหนดสิทธิ์การใช้งานสำหรับพนักงานใหม่'
                : 'Invite an employee and configure their access permissions'}
            </DialogDescription>
          </DialogHeader>
          {formContent}
        </section>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) close(); }}>
      <DialogContent className="min-w-0 gap-5 overflow-x-hidden sm:max-w-5xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{th ? 'เพิ่มพนักงาน' : 'Add employee'}</DialogTitle>
          <DialogDescription>
            {th
              ? 'ส่งคำเชิญและกำหนดสิทธิ์การใช้งานสำหรับพนักงานใหม่'
              : 'Invite an employee and configure their access permissions'}
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

