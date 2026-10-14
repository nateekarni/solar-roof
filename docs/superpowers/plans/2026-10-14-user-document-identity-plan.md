# User Document Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move signer identity to each user, make personal signatures self-managed, and make the existing staff-position field searchable and creatable while preserving permission presets and detailed overrides.

**Architecture:** Add a canonical company-position assignment and bounded personal signature to `users`. Resolve printable identity through a focused service shared by finance workflows. Extend the existing team mutation so an employee edit can atomically select an existing preset or create a named preset with rules, then assign detailed overrides and scope.

**Tech Stack:** PostgreSQL migrations, NestJS, TypeScript, Node test runner, React 19, Next.js 16, cmdk/Radix UI, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-14-approver-signature-and-billing-issuance-design.md`

## Global Constraints

- Company position is a human-readable company title, not the platform role.
- Existing position presets remain the source of inherited permissions; employee overrides remain supported.
- A typed position name creates a real preset with validated rules in the same save operation.
- Personal signature is optional and editable only by its owner.
- Historical document snapshots and PDF bytes never change.
- User-facing output never displays user IDs, position IDs, UUIDs, hashes, or raw database status values.
- All new behavior is test-first; no existing migration is edited.

## File Structure

- Create `infra/migrations/058_user_document_identity.sql`: forward-only columns, constraints, indexes, and safe backfill.
- Create `apps/api/src/modules/identity/document-identity.ts`: validate and resolve printable user identity.
- Create `apps/api/src/modules/identity/document-signature-image.ts`: signature image validation and normalization.
- Create `apps/api/src/modules/identity/document-signature-image.spec.ts`: malicious/invalid/valid image coverage.
- Create `apps/api/src/modules/identity/document-identity.spec.ts`: active-user and position resolution coverage.
- Create `apps/api/src/modules/identity/personal-signature.controller.ts`: self-owned signature mutation.
- Create `apps/api/src/modules/identity/personal-signature.controller.spec.ts`: ownership and removal coverage.
- Modify `apps/api/src/modules/identity/identity.module.ts`: register the controller and identity service.
- Modify `apps/api/src/modules/identity/me.controller.ts`: expose position label/signature availability on the session-safe response and signature bytes only on the authenticated profile response.
- Modify `apps/api/src/modules/identity/own-profile.spec.ts`: profile contract coverage.
- Modify `apps/api/src/modules/identity/team.service.ts`: canonical position reads and atomic create-or-assign mutation.
- Modify `apps/api/src/modules/identity/team.service.spec.ts`: preset/custom position tests.
- Modify `apps/api/src/modules/identity/team.controller.ts`: accept the extended employee draft.
- Create `apps/web/features/settings/own-signature.tsx`: signature upload/remove UI.
- Create `apps/web/features/settings/own-signature.spec.tsx`: copy and control coverage.
- Modify `apps/web/app/(app)/settings/account/page.tsx`: show position and signature card.
- Modify `apps/web/features/settings/staff-permissions-model.ts`: creatable-position draft helpers.
- Modify `apps/web/features/settings/staff-permissions-model.spec.ts`: search/create rules.
- Create `apps/web/features/settings/position-combobox.tsx`: accessible searchable/creatable field.
- Create `apps/web/features/settings/position-combobox.spec.tsx`: result and create-action rendering.
- Modify `apps/web/features/settings/staff-permissions-workspace.tsx`: replace `ChoiceSelect` and submit one atomic draft.
- Modify `apps/web/features/settings/staff-permissions-workspace.spec.tsx`: integration-level UI contract.

---

### Task 1: Persist canonical company position and personal signature

**Files:**
- Create: `infra/migrations/058_user_document_identity.sql`
- Test: `apps/api/src/modules/identity/document-identity.spec.ts`
- Create: `apps/api/src/modules/identity/document-identity.ts`

**Interfaces:**
- Produces: `DocumentIdentityService.resolve(client, userId): Promise<{userId:string; displayName:string; position:string; signatureDataUri?:string}>`.
- Consumes: `employee_positions` and existing `employee_domain_grants`.

- [ ] **Step 1: Write the failing resolver tests**

```ts
test('resolves active approver identity from canonical company position', async () => {
  const identity = await service.resolve(client as never, 'user-a');
  assert.deepEqual(identity, {userId:'user-a', displayName:'สมชาย ใจดี', position:'กรรมการบริษัท'});
});

test('rejects inactive or positionless approvers with readable guidance', async () => {
  await assert.rejects(() => service.resolve(client as never, 'user-a'), /กำหนดตำแหน่งของ สมชาย ใจดี/);
});
```

- [ ] **Step 2: Run the tests and confirm the missing-module failure**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/identity/document-identity.spec.ts`  
Expected: FAIL because `document-identity.ts` does not exist.

- [ ] **Step 3: Add the forward-only migration**

```sql
ALTER TABLE users
  ADD COLUMN company_position_id uuid REFERENCES employee_positions(id),
  ADD COLUMN signature_data text;

ALTER TABLE users ADD CONSTRAINT users_signature_data_bounded CHECK (
  signature_data IS NULL OR (
    length(signature_data) <= 350000
    AND signature_data ~ '^data:image/(png|jpeg);base64,'
  )
);

WITH single_position AS (
  SELECT user_id, min(position_id) AS position_id
  FROM employee_domain_grants
  WHERE position_id IS NOT NULL
  GROUP BY user_id
  HAVING count(DISTINCT position_id) = 1
)
UPDATE users u SET company_position_id = p.position_id
FROM single_position p WHERE p.user_id = u.id;

CREATE INDEX users_company_position_idx ON users(company_position_id);
```

- [ ] **Step 4: Implement the resolver with row locking support**

```ts
export type DocumentIdentity={userId:string;displayName:string;position:string;signatureDataUri?:string};
export class DocumentIdentityService {
 async resolve(client:Pick<PoolClient,'query'>,userId:string):Promise<DocumentIdentity>{
  const row=(await client.query(`SELECT u.id,u.display_name,p.name AS position,u.signature_data
    FROM users u LEFT JOIN employee_positions p ON p.id=u.company_position_id
    WHERE u.id=$1 AND u.status='active' FOR SHARE OF u`,[userId])).rows[0];
  if(!row)throw new ForbiddenException('บัญชีผู้อนุมัติไม่พร้อมใช้งาน');
  if(!row.position?.trim())throw new ConflictException(`กรุณากำหนดตำแหน่งของ ${row.display_name} ในหน้าพนักงานและสิทธิ์`);
  return {userId:row.id,displayName:row.display_name,position:row.position,...(row.signature_data?{signatureDataUri:row.signature_data}:{})};
 }
}
```

- [ ] **Step 5: Run the focused test and migration smoke test**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/identity/document-identity.spec.ts`  
Expected: PASS.

- [ ] **Step 6: Commit the persistence boundary**

```bash
git add infra/migrations/058_user_document_identity.sql apps/api/src/modules/identity/document-identity.ts apps/api/src/modules/identity/document-identity.spec.ts
git commit -m "feat: add user document identity"
```

### Task 2: Add self-owned personal signature API

**Files:**
- Create: `apps/api/src/modules/identity/document-signature-image.ts`
- Create: `apps/api/src/modules/identity/document-signature-image.spec.ts`
- Create: `apps/api/src/modules/identity/personal-signature.controller.ts`
- Create: `apps/api/src/modules/identity/personal-signature.controller.spec.ts`
- Modify: `apps/api/src/modules/identity/identity.module.ts`
- Modify: `apps/api/src/modules/identity/me.controller.ts`
- Modify: `apps/api/src/modules/identity/own-profile.spec.ts`

**Interfaces:**
- Produces: `normalizeDocumentSignature(input: unknown): Promise<string>`.
- Produces: `PUT /v1/me/signature` with `{image:string|null}` and response `{hasSignature:boolean;signatureDataUri?:string}`.
- Produces: `GET /v1/me` fields `companyPosition` and `hasSignature`; `GET /v1/me/profile` additionally returns the current user's `signatureDataUri`.

- [ ] **Step 1: Write failing image and ownership tests**

```ts
test('accepts a bounded single-frame PNG signature and preserves transparency', async()=>{
 const value=await normalizeDocumentSignature(validPngDataUri);
 assert.match(value,/^data:image\/png;base64,/);
});

test('signature mutation always updates the authenticated user',async()=>{
 await controller.save({user:{id:'actor'}} as never,{image:null});
 assert.deepEqual(parameters,['actor']);
});
```

- [ ] **Step 2: Run focused tests and confirm failures**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/identity/document-signature-image.spec.ts src/modules/identity/personal-signature.controller.spec.ts`  
Expected: FAIL because validator/controller are missing.

- [ ] **Step 3: Implement bounded image validation**

```ts
export async function normalizeDocumentSignature(input:unknown):Promise<string>{
 if(typeof input!=='string'||input.length>350_000)throw new BadRequestException('ลายเซ็นต้องเป็นไฟล์ PNG หรือ JPEG ขนาดไม่เกิน 256 KiB');
 const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
 if(!match)throw new BadRequestException('ลายเซ็นต้องเป็นไฟล์ PNG หรือ JPEG');
 const bytes=Buffer.from(match[2]!,'base64');
 const meta=await sharp(bytes,{limitInputPixels:1600*800,failOn:'warning'}).metadata();
 if(!bytes.length||bytes.length>256*1024||!['png','jpeg'].includes(meta.format??'')||(meta.pages??1)!==1)throw new BadRequestException('ลายเซ็นไม่ถูกต้อง');
 return `data:image/${meta.format};base64,${bytes.toString('base64')}`;
}
```

- [ ] **Step 4: Implement self-owned save/remove and profile reads**

```ts
@Put('signature')
async save(@Req() req:Request&{user?:{id:string}},@Body() body:{image?:unknown}){
 if(!req.user?.id)throw new UnauthorizedException('Not authenticated');
 const value=body.image===null?null:await normalizeDocumentSignature(body.image);
 await this.db.query('UPDATE users SET signature_data=$1,updated_at=now() WHERE id=$2',[value,req.user.id]);
 return {hasSignature:Boolean(value),...(value?{signatureDataUri:value}:{})};
}
```

Keep `signatureDataUri` out of `GET /v1/me`, tokens, cookies, and persisted auth-store state. My Account loads the authenticated `/v1/me/profile` resource when its signature card mounts.

- [ ] **Step 5: Register the controller and run identity tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/identity/document-signature-image.spec.ts src/modules/identity/personal-signature.controller.spec.ts src/modules/identity/own-profile.spec.ts`  
Expected: PASS.

- [ ] **Step 6: Commit the personal signature API**

```bash
git add apps/api/src/modules/identity
git commit -m "feat: add personal document signatures"
```

### Task 3: Make staff position assignment select-or-create atomically

**Files:**
- Modify: `apps/api/src/modules/identity/team.service.ts`
- Modify: `apps/api/src/modules/identity/team.service.spec.ts`
- Modify: `apps/api/src/modules/identity/team.controller.ts`

**Interfaces:**
- Consumes employee draft: `{revision:number; position:{id:string}|{name:string;rules:Record<string,boolean|null>}; overrides:Record<string,boolean|null>; scope:Scope}`.
- Produces: `{success:true;revision:number;position:{id:string;name:string}}`.
- Built-in managers such as Owner may receive a canonical position assignment through this screen, but their built-in permissions remain role-derived and cannot be reduced or expanded by the preset.

- [ ] **Step 1: Add failing tests for existing and new positions**

```ts
test('typed position creates preset rules and assigns canonical position in one transaction',async()=>{
 const result=await service.updateGrant(owner,'employee','business',{revision:0,position:{name:'กรรมการบริษัท',rules},overrides,scope});
 assert.equal(result.position.name,'กรรมการบริษัท');
 assert.ok(statements.some(sql=>sql.includes('INSERT INTO employee_positions')));
 assert.ok(statements.some(sql=>sql.includes('company_position_id')));
});

test('existing preset remains selectable with detailed overrides',async()=>{
 const result=await service.updateGrant(owner,'employee','business',{revision:0,position:{id:positionId},overrides,scope});
 assert.equal(result.position.id,positionId);
});

test('owner position assignment does not rewrite role-derived permissions',async()=>{
 await service.updateGrant(owner,owner.id,'business',{revision:0,position:{id:positionId},overrides:{},scope:{mode:'all',siteIds:[]}});
 assert.ok(statements.some(sql=>sql.includes('company_position_id')));
 assert.ok(!statements.some(sql=>sql.includes('employee_domain_grants')&&sql.startsWith('INSERT')));
});
```

- [ ] **Step 2: Run the focused service test**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/identity/team.service.spec.ts`  
Expected: FAIL because `position` object input is rejected.

- [ ] **Step 3: Implement normalized create-or-select inside the existing transaction**

```ts
type PositionDraft={id:string}|{name:string;rules:Record<string,unknown>};
const draft=body.position as PositionDraft;
let positionId:string,positionName:string;
if('id' in draft){
 positionId=uuid(draft.id);
 const preset=(await client.query('SELECT p.name FROM employee_positions p JOIN employee_position_domains d ON d.position_id=p.id AND d.domain=$2 WHERE p.id=$1 FOR SHARE',[positionId,domain])).rows[0];
 if(!preset)throw new BadRequestException('Position has no permission preset in this domain');
 positionName=preset.name;
}else{
 positionName=draft.name.trim();
 const rules=validateDomainRules(domain,draft.rules);
 positionId=randomUUID();
 await client.query('INSERT INTO employee_positions(id,name) VALUES($1,$2)',[positionId,positionName]);
 await client.query('INSERT INTO employee_position_domains(position_id,domain,rules) VALUES($1,$2,$3::jsonb)',[positionId,domain,JSON.stringify(rules)]);
}
await client.query('UPDATE users SET company_position_id=$2,updated_at=now() WHERE id=$1',[userId,positionId]);
if(['operator','accountant'].includes(user.role)){
 await client.query(`INSERT INTO employee_domain_grants(user_id,domain,position_id,overrides,scope_mode,site_ids,updated_by)
 VALUES($1,$2,$3,$4::jsonb,$5,$6::uuid[],$7)
 ON CONFLICT(user_id,domain) DO UPDATE SET position_id=excluded.position_id,overrides=excluded.overrides,scope_mode=excluded.scope_mode,site_ids=excluded.site_ids,updated_by=excluded.updated_by,updated_at=now()`,[userId,domain,positionId,JSON.stringify(overrides),scope.mode,scope.siteIds,actor.id]);
}
```

- [ ] **Step 4: Return display-safe position data and audit the name**

```ts
await this.audit(client,actor,domain,userId,'permissions.updated');
return {success:true,revision:expected+1,position:{id:positionId,name:positionName}};
```

- [ ] **Step 5: Run team and authorization tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/identity/team.service.spec.ts src/modules/identity/domain-authorization.integration.spec.ts`  
Expected: PASS.

- [ ] **Step 6: Commit the atomic team mutation**

```bash
git add apps/api/src/modules/identity/team.service.ts apps/api/src/modules/identity/team.service.spec.ts apps/api/src/modules/identity/team.controller.ts
git commit -m "feat: make staff positions creatable"
```

### Task 4: Add My Account document identity controls

**Files:**
- Create: `apps/web/features/settings/own-signature.tsx`
- Create: `apps/web/features/settings/own-signature.spec.tsx`
- Modify: `apps/web/app/(app)/settings/account/page.tsx`
- Modify: `apps/web/stores/auth-store.ts`

**Interfaces:**
- Consumes: `GET /v1/me/profile`, `PUT /v1/me/signature`, and session-safe fields `companyPosition`, `hasSignature`.
- Produces: an accessible signature card with upload/replace/remove actions.

- [ ] **Step 1: Write failing static-render tests**

```tsx
const html=renderToStaticMarkup(<OwnSignatureCard profile={{displayName:'สมชาย',companyPosition:'กรรมการบริษัท'}} busy={false} onChoose={()=>{}} onRemove={()=>{}}/>);
assert.match(html,/ตำแหน่ง.*กรรมการบริษัท/s);
assert.match(html,/เอกสารในอนาคต/);
assert.doesNotMatch(html,/user-[0-9a-f-]+/);
```

- [ ] **Step 2: Run the focused web test**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/own-signature.spec.tsx`  
Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement upload preview and removal**

```tsx
type Profile={displayName:string;companyPosition:string;signatureDataUri?:string};
export function OwnSignatureCard({profile,busy,onChoose,onRemove}:{profile:Profile;busy:boolean;onChoose:(file:File)=>void;onRemove:()=>void}){
 return <section><p>{profile.companyPosition||'ยังไม่ได้กำหนดตำแหน่ง'}</p>{profile.signatureDataUri&&<img src={profile.signatureDataUri} alt="ลายเซ็นของฉัน"/>}<input aria-label="อัปโหลดลายเซ็น" disabled={busy} type="file" accept="image/png,image/jpeg" onChange={event=>{const file=event.target.files?.[0];if(file)onChoose(file);}}/><Button type="button" disabled={busy||!profile.signatureDataUri} onClick={onRemove}>ลบลายเซ็น</Button></section>;
}
export function OwnSignature(){
 const [profile,setProfile]=useState<Profile|null>(null);
 useEffect(()=>{let active=true;apiClient.get<Profile>('/v1/me/profile').then(value=>{if(active)setProfile(value);});return()=>{active=false;};},[]);
 const save=async(image:string|null)=>setProfile(current=>current?{...current,...await apiClient.put('/v1/me/signature',{image})}:current);
 const choose=async(file:File)=>{
  if(file.size>256*1024||!['image/png','image/jpeg'].includes(file.type))throw new Error('ลายเซ็นต้องเป็น PNG หรือ JPEG ขนาดไม่เกิน 256 KiB');
  const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
  await save(image);
 };
 return profile?<OwnSignatureCard profile={profile} busy={false} onChoose={file=>void choose(file)} onRemove={()=>void save(null)}/>:<p role="status">กำลังโหลดข้อมูลลายเซ็น…</p>;
}
```

- [ ] **Step 4: Add the section to My Account and refresh auth state after save**

```tsx
<Card className="gap-4 px-5 py-5">
 <OwnSignature />
</Card>
```

- [ ] **Step 5: Run settings tests and type checking**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/own-signature.spec.tsx features/settings/account-presentation.spec.ts`  
Run: `pnpm --filter @solar/web lint`  
Expected: PASS.

- [ ] **Step 6: Commit My Account identity UI**

```bash
git add apps/web/app/(app)/settings/account/page.tsx apps/web/features/settings/own-signature.tsx apps/web/features/settings/own-signature.spec.tsx apps/web/stores/auth-store.ts
git commit -m "feat: manage personal document signature"
```

### Task 5: Replace the staff position select with a creatable Combobox

**Files:**
- Create: `apps/web/features/settings/position-combobox.tsx`
- Create: `apps/web/features/settings/position-combobox.spec.tsx`
- Modify: `apps/web/features/settings/staff-permissions-model.ts`
- Modify: `apps/web/features/settings/staff-permissions-model.spec.ts`
- Modify: `apps/web/features/settings/staff-permissions-workspace.tsx`
- Modify: `apps/web/features/settings/staff-permissions-workspace.spec.tsx`

**Interfaces:**
- Produces: `PositionChoice = {kind:'existing';id:string;name:string}|{kind:'new';name:string}`.
- Consumes the atomic employee draft from Task 3.

- [ ] **Step 1: Write failing model and render tests**

```ts
assert.deepEqual(positionOptions('กรรม',positions),[{kind:'existing',id:'p1',name:'กรรมการบริษัท'}]);
assert.deepEqual(positionOptions('หัวหน้าฝ่ายขาย',positions).at(-1),{kind:'new',name:'หัวหน้าฝ่ายขาย'});
```

```tsx
assert.match(renderToStaticMarkup(<PositionCombobox value={null} positions={positions} onChange={()=>{}}/>),/ค้นหาหรือพิมพ์ตำแหน่ง/);
```

- [ ] **Step 2: Run focused tests and confirm failures**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/position-combobox.spec.tsx features/settings/staff-permissions-model.spec.ts`  
Expected: FAIL because the helper/component is missing.

- [ ] **Step 3: Implement the accessible Combobox**

```tsx
<Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild><Button role="combobox" aria-expanded={open}>{label}</Button></PopoverTrigger>
 <PopoverContent><Command shouldFilter={false}><CommandInput value={query} onValueChange={setQuery} placeholder="ค้นหาหรือพิมพ์ตำแหน่ง…"/><CommandList>
  {matches.map(position=><CommandItem key={position.id} value={position.name} onSelect={()=>onChange({kind:'existing',id:position.id,name:position.name})}>{position.name}</CommandItem>)}
  {query.trim()&&!matches.some(position=>position.name.localeCompare(query.trim(),undefined,{sensitivity:'accent'})===0)&&<CommandItem value={`create:${query.trim()}`} onSelect={()=>onChange({kind:'new',name:query.trim()})}>{`สร้างตำแหน่ง “${query.trim()}”`}</CommandItem>}
 </CommandList></Command></PopoverContent>
</Popover>
```

- [ ] **Step 4: Wire existing presets and typed positions into EmployeeEditor**

```ts
const position=choice.kind==='existing'?{id:choice.id}:{name:choice.name,rules:domainOverrides(domain,effectiveRules)};
await apiClient.patch(`/v1/team/employees/${employee.id}/${domain}`,{revision:employee.revision,position,overrides,scope});
```

- [ ] **Step 5: Run staff UI tests and lint**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/position-combobox.spec.tsx features/settings/staff-permissions-model.spec.ts features/settings/staff-permissions-workspace.spec.tsx`  
Run: `pnpm --filter @solar/web lint`  
Expected: PASS.

- [ ] **Step 6: Commit the staff Combobox**

```bash
git add apps/web/features/settings/position-combobox.tsx apps/web/features/settings/position-combobox.spec.tsx apps/web/features/settings/staff-permissions-model.ts apps/web/features/settings/staff-permissions-model.spec.ts apps/web/features/settings/staff-permissions-workspace.tsx apps/web/features/settings/staff-permissions-workspace.spec.tsx
git commit -m "feat: add creatable staff position combobox"
```

### Task 6: Verify the identity foundation

**Files:**
- Modify only if failures identify a regression in files owned by Tasks 1-5.

**Interfaces:**
- Produces a stable identity API for the billing issuance plan.

- [ ] **Step 1: Run all identity API tests**

Run: `pnpm --filter @solar/api exec tsx --tsconfig tsconfig.json --test src/modules/identity/*.spec.ts`  
Expected: PASS.

- [ ] **Step 2: Run all settings UI tests**

Run: `pnpm --filter @solar/web exec tsx --tsconfig tsconfig.ui-tests.json --test features/settings/*.spec.ts features/settings/*.spec.tsx`  
Expected: PASS.

- [ ] **Step 3: Run package lint**

Run: `pnpm --filter @solar/api lint`  
Run: `pnpm --filter @solar/web lint`  
Expected: PASS.

- [ ] **Step 4: Inspect the diff for accidental IDs or company signer fields**

Run: `rg -n "signatoryName|signatoryTitle|signatureDataUri|positionId" apps/web/app/\(app\)/settings/account apps/web/features/settings`  
Expected: internal transport names may occur in code, but no rendered copy prints raw IDs and My Account does not edit company signer fields.

- [ ] **Step 5: Commit verification fixes, if any**

```bash
git add infra/migrations/058_user_document_identity.sql apps/api/src/modules/identity apps/web/app/(app)/settings/account apps/web/features/settings apps/web/stores/auth-store.ts
git commit -m "test: verify user document identity"
```

