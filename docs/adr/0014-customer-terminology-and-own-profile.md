# ADR 0014: Customer terminology and own display names

Status: Accepted, 2026-10-09.

The customer entity may represent a school, company, organization or individual. The current role is `customer_user`; entity identifiers use `customerId`, `customerName`, `customer_id` and `customers`. Role naming stays distinct from variables representing a customer record.

Migration 039 renames the existing table and columns in place and updates user/invitation role constraints. UUIDs, foreign keys, names, scopes and issued financial records are preserved. Historical migrations are immutable. Old signed access/refresh claims are normalized only after signature verification; current authorization still reloads role and customer assignment from the database. New tokens use current terminology.

All five roles use GET/PUT `/v1/me/profile` and the shared own-profile form. Only the authenticated account's display name can be updated; email, role and identity cannot be supplied through this endpoint. Header presentation changes immediately while authenticated role/scope continue to come from the verified session.

Deployment must coordinate application/worker updates with migration 039 because old binaries query the former table and column names. Saved document bytes and historical audit payloads are not rewritten. Existing external integrations must use the renamed `/v1/customers`, `/v1/sites/:id/customer-users` routes and `customerId`/`customerName` fields.
