'use client';
import {useEffect,useState,useMemo,type FormEvent} from 'react';
import {accountRoleLabel} from './account-presentation';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {useSessionUser} from '../../providers/session-user-provider';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {SearchInput} from '../../components/ui/search-input';
import {MoreHorizontal} from 'lucide-react';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '../../components/ui/dropdown-menu';
import {Label} from '../../components/ui/label';
import {ChoiceSelect} from '../../components/ui/choice-select';
import {Checkbox} from '../../components/ui/checkbox';
import {PositionCombobox, FreeformPositionCombobox} from './position-combobox';
import {DataTable} from '../../components/ui/data-table';
import type {ColumnDef} from '@tanstack/react-table';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '../../components/ui/table';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../../components/ui/tabs';
import {effectiveRule,domainOverrides,filterEmployees,filterPositions,staffDraftChanged,positionRulesChanged,canDismissStaffDialog,staffStatusLabel,employeePositionDraft,employeePositionLabel,isActionValidForResource,applyPositionPreset,buildInvitePayload,type RuleValue,type PositionChoice} from './staff-permissions-model';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../components/ui/dialog';
export type Domain='business'|'technical';export type Scope={mode:'all'|'selected';siteIds:string[]};
export type Position={id:string;name:string;rules:Record<string,RuleValue>;revision:number};
type Employee={id:string;email:string;displayName:string;avatarData?:string|null;role:string;status:string;revision:number;companyPositionId:string|null;companyPosition:string|null;grant:{positionId:string|null;overrides:Record<string,RuleValue>;scope:Scope}|null};
export function StaffPermissionsWorkspace(){
 const user=useSessionUser(),th=useLocale()==='th',domain:Domain=user.role==='owner'?'business':'technical';
 const [employees,setEmployees]=useState<Employee[]>([]),[positions,setPositions]=useState<Position[]>([]),[permissions,setPermissions]=useState<string[]>([]),[sites,setSites]=useState<{id:string;name:string}[]>([]),[selected,setSelected]=useState<Employee|null>(null),[selectedPosition,setSelectedPosition]=useState<Position|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setError('');Promise.all([apiClient.get<{employees:Employee[]}>(`/v1/team/employees?domain=${domain}`),apiClient.get<{positions:Position[]}>(`/v1/team/positions?domain=${domain}`),apiClient.get<{permissions:string[]}>(`/v1/team/catalog?domain=${domain}`),apiClient.get<{id:string;name:string}[]>(domain==='business'?'/v1/sites':'/v1/gateways/site-options?includeAssigned=true')]).then(([e,p,c,s])=>{if(active){setEmployees(e.employees);setPositions(p.positions);setPermissions(c.permissions);setSites(s);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[domain,revision]);
 const [inviting,setInviting]=useState(false),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[positionFilter,setPositionFilter]=useState('all');
 const [tab,setTab]=useState('employees'),[positionSearch,setPositionSearch]=useState(''),[positionUsage,setPositionUsage]=useState('all');
 const filteredPositions=filterPositions(positions,employees,positionSearch,positionUsage);
 const statusLabel=(status:string)=>staffStatusLabel(status,th?'th':'en');
 const statusBadge=(status:string)=><span className={status==='active'?'inline-flex rounded-full px-2 py-1 text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400':'inline-flex rounded-full px-2 py-1 text-xs bg-muted text-muted-foreground'}>{statusLabel(status)}</span>;
 const employeeActions=(employee:Employee)=><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={(th?'การจัดการพนักงาน: ':'Employee actions: ')+employee.displayName}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setSelected(employee)}>{th?'จัดการสิทธิ์':'Manage permissions'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
 const positionActions=(position:Position)=><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={(th?'การจัดการตำแหน่ง: ':'Position actions: ')+position.name}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setSelectedPosition(position)}>{th?'จัดการสิทธิ์':'Manage permissions'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
 const filtered=filterEmployees(employees,search,status,positionFilter);
 const refresh=()=>{setInviting(false);setSelected(null);setSelectedPosition(null);setRevision(n=>n+1);window.dispatchEvent(new Event('permissions-updated'));};
const employeeColumns:ColumnDef<Employee>[]=[
 {accessorKey:'displayName',header:th?'พนักงาน':'Employee'}, {accessorKey:'email',header:th?'อีเมล':'Email'},
 {id:'position',accessorFn:e=>employeePositionLabel(e,positions),header:th?'ตำแหน่ง':'Position'},
 {id:'scope',accessorFn:e=>['owner','admin'].includes(e.role)||e.grant?.scope.mode==='all'?(th?'ทุกไซต์':'All sites'):e.grant?.scope.siteIds.map(id=>sites.find(s=>s.id===id)?.name??(th?'ไซต์ที่ไม่มีข้อมูล':'Unavailable site')).join(', ')||'—',header:th?'ขอบเขตไซต์':'Site scope'},
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
  return <main className="content space-y-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">{th?'ทีมงานและสิทธิ์':'Staff and permissions'}</h1><p className="text-sm text-muted-foreground">{domain==='business'?(th?'จัดการสิทธิ์ธุรกิจและขอบเขตไซต์งาน':'Manage business permissions and site scope'):(th?'จัดการสิทธิ์เทคนิคและขอบเขตไซต์งาน':'Manage technical permissions and site scope')}</p></div>{tab==='employees'?<Button onClick={()=>setInviting(true)}>{th?'เพิ่มพนักงาน':'Add employee'}</Button>:<Button onClick={()=>setSelectedPosition({id:'',name:'',rules:{},revision:0})}>{th?'เพิ่มตำแหน่ง':'Add position'}</Button>}</header>{inviting&&<StaffInvitation domain={domain} positions={positions} permissions={permissions} sites={sites} onSaved={refresh} onClose={()=>setInviting(false)}/>}{error&&<p role="alert">{error}</p>}<Tabs value={tab} onValueChange={setTab}><TabsContent value="employees" className="space-y-4"><div className="flex flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><SearchInput className="w-full sm:max-w-xs" aria-label={th?'ค้นหาพนักงาน':'Search employees'} placeholder={th?'ค้นหาพนักงาน':'Search employees'} value={search} onChange={e=>setSearch(e.target.value)}/><div className="flex flex-wrap gap-2 sm:ml-auto"><ChoiceSelect className="w-[160px] max-w-full" aria-label={th?'สถานะพนักงาน':'Employee status'} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{th?'ทุกสถานะ':'All statuses'}</option>{[...new Set(employees.map(employee=>employee.status))].sort().map(value=><option key={value} value={value}>{statusLabel(value)}</option>)}</ChoiceSelect><ChoiceSelect className="w-[220px] max-w-full" aria-label={th?'ตำแหน่งพนักงาน':'Employee position'} value={positionFilter} onChange={e=>setPositionFilter(e.target.value)}><option value="all">{th?'ทุกตำแหน่ง':'All positions'}</option><option value="unassigned">{th?'ไม่มีตำแหน่ง':'Unassigned'}</option>{positions.map(position=><option key={position.id} value={position.id}>{position.name}</option>)}</ChoiceSelect></div></div>{staffTabsList}</div><div className="hidden md:block"><DataTable columns={employeeColumns} data={filtered} getRowId={row=>row.id} hideSearch/></div><div className="space-y-3 md:hidden">{filtered.map(employee=><article key={employee.id} className="rounded-xl border bg-card p-4 space-y-2"><h2 className="font-medium">{employee.displayName}</h2><p className="break-all text-sm">{employee.email}</p><p className="text-sm">{employeePositionLabel(employee,positions)}</p>{statusBadge(employee.status)}<p className="text-sm">{['owner','admin'].includes(employee.role)||employee.grant?.scope.mode==='all'?(th?'ทุกไซต์':'All sites'):employee.grant?.scope.siteIds.map(id=>sites.find(s=>s.id===id)?.name??(th?'ไซต์ที่ไม่มีข้อมูล':'Unavailable site')).join(', ')||'—'}</p>{employeeActions(employee)}</article>)}{!filtered.length&&<p className="rounded-xl border p-4">{th?'ไม่พบพนักงาน':'No employees found'}</p>}</div></TabsContent><TabsContent value="positions" className="space-y-4"><div className="flex flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><SearchInput className="w-full sm:max-w-xs" aria-label={th?'ค้นหาตำแหน่ง':'Search positions'} placeholder={th?'ค้นหาตำแหน่ง':'Search positions'} value={positionSearch} onChange={e=>setPositionSearch(e.target.value)}/><ChoiceSelect className="w-[200px] max-w-full sm:ml-auto" aria-label={th?'การใช้ตำแหน่ง':'Position assignment'} value={positionUsage} onChange={e=>setPositionUsage(e.target.value)}><option value="all">{th?'ทุกตำแหน่ง':'All positions'}</option><option value="assigned">{th?'มีพนักงานใช้':'Assigned'}</option><option value="unused">{th?'ยังไม่มีพนักงานใช้':'Unused'}</option></ChoiceSelect></div>{staffTabsList}</div><div className="hidden md:block"><DataTable columns={positionColumns} data={filteredPositions} getRowId={row=>row.id} hideSearch/></div><div className="space-y-3 md:hidden">{filteredPositions.map(position=><article key={position.id} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-medium">{position.name}</h2>{positionActions(position)}</div><p className="text-sm text-muted-foreground">{th?'พนักงาน':'Employees'}: {employees.filter(employee=>employee.companyPositionId===position.id||employee.grant?.positionId===position.id).length}</p></article>)}{!filteredPositions.length&&<p className="rounded-xl border p-4">{th?'ไม่พบตำแหน่ง':'No positions found'}</p>}</div></TabsContent></Tabs>{selected&&<EmployeeEditor key={selected.id+'-'+selected.revision} employee={selected} domain={domain} positions={positions} permissions={permissions} sites={sites} onSaved={refresh} onClose={()=>setSelected(null)} canDeactivate={user.role==='owner'}/>}{selectedPosition&&<PositionEditor key={selectedPosition.id+'-'+selectedPosition.revision} position={selectedPosition} domain={domain} permissions={permissions} onSaved={refresh} onClose={()=>setSelectedPosition(null)}/>}</main>;
}
export function RuleMatrix({
  permissions,
  rules = {},
  overrides = {},
  onChange,
  disabled = false,
}: {
  permissions: string[];
  rules?: Record<string, RuleValue>;
  overrides?: Record<string, RuleValue>;
  onChange: (permission: string, value: RuleValue) => void;
  inherit?: boolean;
  disabled?: boolean;
}) {
  const th = useLocale() === 'th';
  const groups = [...new Set(permissions.map((p) => p.split('.')[1]!))];
  const actions = ['view', 'edit', 'approve', 'download'] as const;
  const actionLabels = th ? ['ดู', 'แก้ไข', 'อนุมัติ', 'ดาวน์โหลด'] : ['View', 'Edit', 'Approve', 'Download'];
  const resourceLabels: Record<string, [string, string]> = {
    dashboard: ['ภาพรวม', 'Dashboard'],
    sites: ['ไซต์งาน', 'Sites'],
    customers: ['ลูกค้า', 'Customers'],
    billing: ['ใบวางบิล', 'Billing'],
    receipts: ['ใบเสร็จ', 'Receipts'],
    documents: ['เอกสาร', 'Documents'],
    tariffs: ['อัตราค่าไฟ', 'Tariffs'],
    settings: ['ตั้งค่า', 'Settings'],
    audit: ['ประวัติ', 'Audit'],
    gateways: ['เกตเวย์', 'Gateways'],
    devices: ['อุปกรณ์', 'Devices'],
    fields: ['รายการข้อมูล', 'Fields'],
    profiles: ['โปรไฟล์', 'Profiles'],
    registers: ['รีจิสเตอร์', 'Registers'],
    reception: ['การรับข้อมูล', 'Reception'],
    brokers: ['การเชื่อมต่อ', 'Brokers'],
    alerts: ['การแจ้งเตือน', 'Alerts'],
    telemetry: ['ข้อมูลเทคนิค', 'Telemetry'],
  };

  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px] sm:w-[220px] font-semibold">{th ? 'งาน' : 'Resource'}</TableHead>
            {actionLabels.map((label) => (
              <TableHead key={label} className="w-24 text-center font-semibold">
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const resName = resourceLabels[group]?.[th ? 0 : 1] ?? group;
            return (
              <TableRow key={group} className="hover:bg-muted/40 transition-colors">
                <TableCell className="font-medium text-foreground">{resName}</TableCell>
                {actions.map((action, index) => {
                  const isValid = isActionValidForResource(group, action);
                  const permission = permissions.find((p) => p.endsWith('.' + group + '.' + action));

                  if (!isValid || !permission) {
                    return (
                      <TableCell key={action} className="text-center">
                        <span className="font-medium text-muted-foreground/30 select-none">—</span>
                      </TableCell>
                    );
                  }

                  const isChecked = overrides[permission] === true || (overrides[permission] == null && rules[permission] === true);

                  return (
                    <TableCell key={action} className="text-center">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          id={`perm-${permission}`}
                          aria-label={`${resName} ${actionLabels[index]}`}
                          checked={isChecked}
                          disabled={disabled}
                          onCheckedChange={(checked) => onChange(permission, Boolean(checked))}
                        />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
export function EmployeeEditor({employee,domain,positions,permissions,sites,onSaved,onClose,canDeactivate}:{employee:Employee;domain:Domain;positions:Position[];permissions:string[];sites:{id:string;name:string}[];onSaved:()=>void;onClose:()=>void;canDeactivate:boolean}){
 const th=useLocale()==='th',builtInManager=['owner','admin'].includes(employee.role);
 const initialPosition=positions.find(position=>position.id===(employee.grant?.positionId??employee.companyPositionId));
 const initialChoice:PositionChoice|null=initialPosition?{kind:'existing',id:initialPosition.id,name:initialPosition.name}:null;
 const initialOverrides=useMemo<Record<string,RuleValue>>(()=>{
  const existingGrant=employee.grant;
  const initialPos=positions.find(p=>p.id===(existingGrant?.positionId??employee.companyPositionId));
  const initialRules=initialPos?.rules??{};
  const map:Record<string,RuleValue>={};
  for(const perm of permissions.filter(p=>p.startsWith(domain+'.'))){
    if(existingGrant?.overrides&&existingGrant.overrides[perm]!==undefined&&existingGrant.overrides[perm]!==null){
      map[perm]=existingGrant.overrides[perm];
    }else{
      map[perm]=initialRules[perm]===true;
    }
  }
  return map;
 },[]);
 const [choice,setChoice]=useState<PositionChoice|null>(initialChoice),[draftRules,setDraftRules]=useState<Record<string,RuleValue>>({}),[permissionsConfigured,setPermissionsConfigured]=useState(false),[overrides,setOverrides]=useState<Record<string,RuleValue>>(initialOverrides),[scope,setScope]=useState<Scope>(employee.grant?.scope??{mode:'selected',siteIds:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[impact,setImpact]=useState<{activeSessions:number;domains:{domain:string;scopeMode:string;siteIds:string[]}[]}|null>(null);
 const [editorTab,setEditorTab]=useState('profile'),[siteSearch,setSiteSearch]=useState('');
 const [baseRevision,setBaseRevision]=useState(employee.revision),[currentPositions,setCurrentPositions]=useState(positions),[conflict,setConflict]=useState<'revision'|'position'|null>(null),[latest,setLatest]=useState<{employee:Employee;positions:Position[]}|null>(null);
 const [conflictingPositionId,setConflictingPositionId]=useState<string|null>(null);
 const positionKey=(value:PositionChoice|null)=>value?.kind==='existing'?value.id:value?'new:'+value.name:'';
 const dirty=staffDraftChanged({positionId:positionKey(initialChoice),overrides:initialOverrides,scope:employee.grant?.scope??{mode:'selected',siteIds:[]}},{positionId:positionKey(choice),overrides,scope});
 const close=()=>{if(!busy&&(!dirty||window.confirm(th?'ละทิ้งการเปลี่ยนแปลงที่ยังไม่บันทึก?':'Discard unsaved changes?')))onClose();};
 const rules=choice?.kind==='existing'?currentPositions.find(p=>p.id===choice.id)?.rules??{}:draftRules;
 const choosePosition=(next:PositionChoice)=>{
  setChoice(next);
  if(next.kind==='existing'){
    const pos=currentPositions.find(p=>p.id===next.id);
    const nextOverrides:Record<string,RuleValue>={...overrides};
    for(const p of permissions.filter(perm=>perm.startsWith(domain+'.'))){
      nextOverrides[p]=pos?.rules[p]===true;
    }
    setOverrides(nextOverrides);
  }else if(next.kind==='new'){
    setDraftRules(rules);
    setPermissionsConfigured(false);
  }
  setError('');
 };
 async function save(e:FormEvent){
  e.preventDefault();
  if(busy||conflict)return;
  setError('');
  if(!choice){setError(th?'กรุณาเลือกหรือสร้างตำแหน่ง':'Choose or create a position');return;}
  if(choice.kind==='new'&&!builtInManager&&!permissionsConfigured){setEditorTab('permissions');setError(th?'กรุณากำหนดและยืนยันสิทธิ์สำหรับตำแหน่งใหม่':'Configure and confirm permissions for the new position');return;}
  setBusy(true);
  try{
    const snapshotOverrides:Record<string,RuleValue>={};
    for(const p of permissions.filter(perm=>perm.startsWith(domain+'.'))){
      snapshotOverrides[p]=overrides[p]===true;
    }
    const result=await apiClient.patch<{success:true;revision:number;position:{id:string;name:string}}>(`/v1/team/employees/${employee.id}/${domain}`,employeePositionDraft({revision:baseRevision,choice,domain,permissions,rules,overrides:snapshotOverrides,scope,permissionsConfigured,builtInManager}));
    setChoice({kind:'existing',id:result.position.id,name:result.position.name});
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
  return (
  <Dialog open onOpenChange={(open:boolean)=>{if(!open)close();}}>
   <DialogContent className="min-w-0 gap-5 overflow-x-hidden sm:max-w-5xl">
    <DialogHeader className="pr-8">
     <DialogTitle>{th?'จัดการพนักงาน':'Manage employee'}</DialogTitle>
     <DialogDescription>{domain==='business'?(th?'สิทธิ์ธุรกิจ':'Business permissions'):(th?'สิทธิ์เทคนิค':'Technical permissions')}</DialogDescription>
    </DialogHeader>
    <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
     <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
      {employee.avatarData?<img src={employee.avatarData} alt="" className="size-full object-cover"/>:<span className="text-lg">{employee.displayName.slice(0,1)||'?'}</span>}
     </div>
     <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
       <p className="break-words font-semibold">{employee.displayName}</p>
       <span className={employee.status==='active'?'inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400':'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'}>{staffStatusLabel(employee.status,th?'th':'en')}</span>
      </div>
      <p className="mt-1 break-all text-sm text-muted-foreground">{employee.email}</p>
     </div>
    </div>
    <form onSubmit={save} className="min-w-0 space-y-5">
     <fieldset disabled={busy} className="min-w-0"><Tabs className="min-w-0" value={editorTab} onValueChange={setEditorTab}>
      <TabsList className="h-10">
       <TabsTrigger value="profile">{th?'โปรไฟล์':'Profile'}</TabsTrigger>
       <TabsTrigger value="permissions">{th?'สิทธิ์':'Permissions'}</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="min-w-0 space-y-6 pt-4">
       <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-semibold">{th?'ข้อมูลบัญชี':'Account details'}</h3>
        <dl className="divide-y rounded-xl border px-4">
         {[[th?'ชื่อ':'Name',employee.displayName],[th?'อีเมล':'Email',employee.email],[th?'บทบาท':'Role',accountRoleLabel(employee.role,th?'th':'en')],[th?'ตำแหน่งในบริษัท':'Company position',employeePositionLabel(employee,positions)]].map(([label,value])=>(
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
           <dt className="text-sm text-muted-foreground">{label}</dt>
           <dd className="min-w-0 break-words text-sm font-medium">{value}</dd>
          </div>
         ))}
        </dl>
       </section>
       <section className="min-w-0 space-y-3">
        <div>
         <h3 className="text-sm font-semibold">{th?'ตำแหน่งและสิทธิ์เริ่มต้น':'Position assignment'}</h3>
         <p className="mt-1 text-sm text-muted-foreground">{builtInManager?(th?'เลือกหรือสร้างตำแหน่งในบริษัท สิทธิ์การใช้งานยังคงกำหนดตามบทบาท':'Choose or create a company position. Access remains defined by your role.'):(th?'เลือกตำแหน่งเพื่อใช้สิทธิ์เริ่มต้น หรือพิมพ์ชื่อเพื่อสร้างใหม่ แล้วกำหนดสิทธิ์ในแท็บสิทธิ์':'Choose a permission preset or type a new title, then configure access in Permissions.')}</p>
        </div>
        <div className="grid gap-2 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
         <Label htmlFor="staff-position">{th?'ตำแหน่ง':'Position'}</Label>
         <PositionCombobox id="staff-position" value={choice} positions={currentPositions} onChange={choosePosition} disabled={busy||!!conflict}/>
        </div>
       </section>
      </TabsContent>
      <TabsContent value="permissions" className="min-w-0 space-y-6 pt-4">
       {builtInManager?<p className="text-sm text-muted-foreground">{th?'สิทธิ์และขอบเขตไซต์กำหนดตามบทบาทเจ้าของหรือผู้ดูแลระบบ':'Permissions and site scope are defined by the Owner or Administrator role.'}</p>:<><section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
         <div>
          <h3 className="text-sm font-semibold">{th?'สิทธิ์การใช้งาน':'Access permissions'}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{th?'กำหนดสิทธิ์สำหรับพนักงานคนนี้ (ติ๊กถูก = อนุญาต)':'Configure access for this employee (checked = allowed)'}</p>
         </div>
         {choice?.kind==='existing'&&<Button type="button" variant="outline" size="sm" onClick={()=>{const pos=currentPositions.find(p=>p.id===choice.id);const nextOverrides:Record<string,RuleValue>={...overrides};for(const p of permissions.filter(perm=>perm.startsWith(domain+'.'))){nextOverrides[p]=pos?.rules[p]===true;}setOverrides(nextOverrides);}}>{th?'คืนค่าตามตำแหน่ง':'Reset to position preset'}</Button>}
        </div>
        <RuleMatrix permissions={permissions} rules={rules} overrides={overrides} onChange={(permission,value)=>{setOverrides({...overrides,[permission]:value});setPermissionsConfigured(false);}}/>
        {choice?.kind==='new'&&<Label className="flex items-center gap-2"><input type="checkbox" aria-label={th?'ยืนยันสิทธิ์สำหรับตำแหน่งใหม่':'Confirm permissions for the new position'} checked={permissionsConfigured} onChange={event=>setPermissionsConfigured(event.target.checked)}/>{th?'ยืนยันสิทธิ์สำหรับตำแหน่งใหม่':'Confirm permissions for the new position'}</Label>}
       </section>
       <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold">{th?'ขอบเขตข้อมูลของเขตนี้':'Data scope for this domain'}</legend>
        <ChoiceSelect className="w-full sm:max-w-xs" aria-label={th?'ขอบเขตไซต์':'Site scope'} value={scope.mode} onChange={e=>setScope({...scope,mode:e.target.value as Scope['mode']})}>
         <option value="all">{th?'ทุกไซต์':'All sites'}</option>
         <option value="selected">{th?'ไซต์ที่เลือก':'Selected sites'}</option>
        </ChoiceSelect>
        {scope.mode==='selected'&&<SiteScopeTable sites={sites} scope={scope} search={siteSearch} onSearch={setSiteSearch} onChange={setScope}/>}
       </fieldset></>}
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
        <fieldset disabled><RuleMatrix permissions={permissions} rules={latest.positions.find(position=>position.id===latest.employee.grant?.positionId)?.rules??{}} overrides={latest.employee.grant?.overrides??{}} onChange={()=>{}}/></fieldset>
        <p>{th?'ขอบเขตไซต์ล่าสุด':'Latest site scope'}: {latest.employee.grant?.scope.mode==='all'?(th?'ทุกไซต์':'All sites'):latest.employee.grant?.scope.siteIds.map(id=>sites.find(site=>site.id===id)?.name??(th?'ไซต์ที่ไม่มีข้อมูล':'Unavailable site')).join(', ')||(th?'ไม่มีไซต์':'No sites')}</p>
        <p>{th?'สิทธิ์ของร่างเมื่อใช้ข้อมูลล่าสุด':'Draft permissions using the latest preset'}: {duplicatePreset?.name??choice?.name??'—'}</p>
        <fieldset disabled><RuleMatrix permissions={permissions} rules={reviewedDraftRules} overrides={overrides} onChange={()=>{}}/></fieldset>
        <p>{th?'ขอบเขตไซต์ของร่าง':'Draft site scope'}: {scope.mode==='all'?(th?'ทุกไซต์':'All sites'):scope.siteIds.map(id=>sites.find(site=>site.id===id)?.name??(th?'ไซต์ที่ไม่มีข้อมูล':'Unavailable site')).join(', ')||(th?'ไม่มีไซต์':'No sites')}</p>
       </>}
       <p>{th?'การยืนยันจะใช้ข้อมูลล่าสุดเป็นฐาน ร่างสิทธิ์และขอบเขตไซต์ของคุณยังอยู่ แล้วกดบันทึกอีกครั้ง':'Confirm to use the latest state as a base while retaining your draft permissions and site scope. Save explicitly afterward.'}</p>
       <Button type="button" disabled={busy||conflict==='position'&&!duplicatePreset} onClick={reviewLatest}>{th?'ยืนยันว่าได้ตรวจสอบข้อมูลล่าสุด':'Confirm latest information reviewed'}</Button>
      </section>}
     </section>}
     {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
     <div className="flex justify-end gap-2 border-t pt-4">
      <Button type="button" variant="outline" disabled={busy} onClick={close}>{th?'ยกเลิก':'Cancel'}</Button>
      <Button type="submit" disabled={busy||!!conflict}>{th?'บันทึกสิทธิ์':'Save permissions'}</Button>
     </div>
    </form>
   </DialogContent>
  </Dialog>
  );
}
function PositionEditor({position,domain,permissions,onSaved,onClose}:{position:Position;domain:Domain;permissions:string[];onSaved:()=>void;onClose:()=>void}){const th=useLocale()==='th';const [name,setName]=useState(position.name),[rules,setRules]=useState(position.rules),[error,setError]=useState(''),[busy,setBusy]=useState(false);const dirty=name.trim()!==(position.name??'').trim()||positionRulesChanged(position.rules,rules);const close=()=>{if(!busy&&(!dirty||window.confirm(th?'ละทิ้งการเปลี่ยนแปลงที่ยังไม่บันทึก?':'Discard unsaved changes?')))onClose();};async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{if(position.id)await apiClient.patch(`/v1/team/positions/${position.id}/${domain}`,{revision:position.revision,name,rules:domainOverrides(domain,rules)});else await apiClient.post(`/v1/team/positions/${domain}`,{name,rules:domainOverrides(domain,rules)});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}return <Dialog open onOpenChange={(open:boolean)=>{if(!open)close();}}><DialogContent className="sm:max-w-5xl"><DialogHeader><DialogTitle>{position.id?(th?'จัดการตำแหน่ง':'Manage position'):(th?'เพิ่มตำแหน่ง':'Add position')}</DialogTitle><DialogDescription>{th?'กำหนดสิทธิ์เริ่มต้นสำหรับตำแหน่งนี้':'Set default permissions for this position preset'}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><div className="space-y-2"><Label htmlFor="position-name">{th?'ชื่อตำแหน่ง':'Position name'}</Label><Input id="position-name" value={name} required readOnly={!!position.id} onChange={e=>setName(e.target.value)}/></div><div className="space-y-2"><Label>{th?'สิทธิ์เริ่มต้น':'Default permissions'}</Label><RuleMatrix permissions={permissions} rules={{}} overrides={rules} onChange={(permission,value)=>{setRules({...rules,[permission]:value});}}/></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>{th?'ยกเลิก':'Cancel'}</Button><Button type="submit" disabled={busy}>{position.id?(th?'บันทึกตำแหน่ง':'Save position'):(th?'เพิ่มตำแหน่ง':'Add position')}</Button></div></form></DialogContent></Dialog>;}
export function StaffInvitation({
  domain,
  positions,
  permissions,
  sites,
  onSaved,
  onClose,
  inline = false,
}: {
  domain: Domain;
  positions: Position[];
  permissions: string[];
  sites: { id: string; name: string }[];
  onSaved: () => void;
  onClose: () => void;
  inline?: boolean;
}) {
  const th = useLocale() === 'th';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [overrides, setOverrides] = useState<Record<string, RuleValue>>({});
  const [scope, setScope] = useState<Scope>({ mode: 'all', siteIds: [] });
  const [activeTab, setActiveTab] = useState<'general' | 'permissions'>('general');
  const [siteSearch, setSiteSearch] = useState('');
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
    if (canDismissStaffDialog(busy, dirty, () => window.confirm(th ? 'ละทิ้งการเปลี่ยนแปลงที่ยังไม่บันทึก?' : 'Discard unsaved changes?'))) {
      onClose();
    }
  };

  async function invite(e: FormEvent) {
    e.preventDefault();
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
    <form onSubmit={invite} className="min-w-0 space-y-5">
      <fieldset disabled={busy} className="min-w-0">
        <Tabs className="min-w-0" value={activeTab} onValueChange={(val) => setActiveTab(val as 'general' | 'permissions')}>
          <TabsList className="h-10">
            <TabsTrigger value="general">{th ? 'ข้อมูลทั่วไป' : 'General details'}</TabsTrigger>
            <TabsTrigger value="permissions">{th ? 'สิทธิ์การใช้งานและไซต์' : 'Permissions & site scope'}</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="min-w-0 space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-name">{th ? 'ชื่อ' : 'Name'}</Label>
                <Input
                  id="staff-name"
                  value={name}
                  required
                  placeholder={th ? 'เช่น สมชาย ใจดี' : 'e.g. John Doe'}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-email">{th ? 'อีเมล' : 'Email'}</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  required
                  placeholder="user@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="staff-position">{th ? 'ตำแหน่ง' : 'Position'}</Label>
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
          </TabsContent>
          <TabsContent value="permissions" className="min-w-0 space-y-6 pt-4">
            <section className="min-w-0 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{th ? 'สิทธิ์การใช้งาน' : 'Access permissions'}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {th
                    ? 'กำหนดสิทธิ์สำหรับพนักงานคนนี้ (ติ๊กถูก = อนุญาต)'
                    : 'Configure access for this employee (checked = allowed)'}
                </p>
              </div>
              <RuleMatrix
                permissions={permissions}
                rules={{}}
                overrides={overrides}
                onChange={(perm, val) => setOverrides({ ...overrides, [perm]: val })}
              />
            </section>
            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-semibold">{th ? 'ขอบเขตข้อมูลของเขตนี้' : 'Data scope for this domain'}</legend>
              <ChoiceSelect
                className="w-full sm:max-w-xs"
                aria-label={th ? 'ขอบเขตไซต์' : 'Site scope'}
                value={scope.mode}
                onChange={(e) => setScope({ ...scope, mode: e.target.value as Scope['mode'] })}
              >
                <option value="all">{th ? 'ทุกไซต์' : 'All sites'}</option>
                <option value="selected">{th ? 'ไซต์ที่เลือก' : 'Selected sites'}</option>
              </ChoiceSelect>
              {scope.mode === 'selected' && (
                <SiteScopeTable
                  sites={sites}
                  scope={scope}
                  search={siteSearch}
                  onSearch={setSiteSearch}
                  onChange={setScope}
                />
              )}
            </fieldset>
          </TabsContent>
        </Tabs>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" disabled={busy} onClick={close}>
          {th ? 'ยกเลิก' : 'Cancel'}
        </Button>
        <Button disabled={busy} type="submit">
          {th ? 'ส่งคำเชิญ' : 'Send invitation'}
        </Button>
      </div>
    </form>
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




export function SiteScopeTable({sites,scope,search,onSearch,onChange}:{sites:{id:string;name:string}[];scope:Scope;search:string;onSearch:(value:string)=>void;onChange:(scope:Scope)=>void}){const th=useLocale()==='th';const term=search.trim().toLocaleLowerCase();const visible=sites.filter(site=>site.name.toLocaleLowerCase().includes(term));return <div className="space-y-3"><SearchInput aria-label={th?'ค้นหาไซต์':'Search sites'} placeholder={th?'ค้นหาไซต์':'Search sites'} value={search} onChange={e=>onSearch(e.target.value)}/><p className="text-sm text-muted-foreground">{th?'ไซต์ที่เลือก':'Selected sites'}: {scope.siteIds.length}</p><div className="max-h-64 overflow-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead className="w-16">{th?'เลือก':'Select'}</TableHead><TableHead>{th?'ไซต์งาน':'Site'}</TableHead></TableRow></TableHeader><TableBody>{visible.map(site=><TableRow key={site.id}><TableCell><input type="checkbox" aria-label={(th?'เลือกไซต์ ':'Select site ')+site.name} checked={scope.siteIds.includes(site.id)} onChange={e=>onChange({...scope,siteIds:e.target.checked?[...scope.siteIds,site.id]:scope.siteIds.filter(id=>id!==site.id)})}/></TableCell><TableCell>{site.name}</TableCell></TableRow>)}{!visible.length&&<TableRow><TableCell colSpan={2}>{th?'ไม่พบไซต์':'No sites found'}</TableCell></TableRow>}</TableBody></Table></div></div>;}
