# Customer terminology and own profile implementation plan

Approved scope: customer_user replaces school_user; customer terminology replaces school identifiers across application, API, scripts and schema. Customers can be schools, companies or individuals. Every role can edit only its own display name.

1. Establish failing regression coverage for customer_user authorization and all-role own-profile validation.
2. Rename current application symbols, payload properties, route paths, filenames and schema mappings to customer terminology. Preserve historical migrations and third-party licenses.
3. Add migration 039 renaming schools/customer references in place, updating users and invitations, and preserving UUIDs and foreign keys. Normalize old signed token claims at verification during transition. Current API contracts use customerId.
4. Add shared own-profile form to account settings and customer settings; update authenticated display state and header immediately. Keep email and role immutable through profile endpoint.
5. Build packages, run lint and full tests, apply localhost migration, and verify existing accounts, scopes, profiles and UI. Do not reset data or rewrite historical document snapshots.

## Verified implementation
- Current source symbols, routes and filenames use customer terminology. Migration history and explicit signed-token compatibility retain legacy spellings.
- Applied migration039 on localhost. Pre/post hashes match for user IDs/names/customer assignments, invitation records, sites, customers, contracts, documents, billing cycles, payments and notification events.
- Actual browser/API tests for admin, owner and customer_user: GET profile, save, immediate header update, reload persistence, rejection of supplied other user ID. Customer administrative API access remains forbidden. Original names and timestamps restored; test sessions removed.
- All five roles have controller/route-policy tests. Added signed legacy-token compatibility regression.
- Independent static review found no actionable regressions in deployment scripts, scopes, profile handling or preserved financial artifacts.

The later localhost site count changed because the user confirmed deleting the test site while verification was in progress. The migration's immediate before/after invariant passed; no test recreates or restores that user-deleted site. Own-profile browser checks returned original display names and removed temporary sessions.
Final checks: web243 tests pass; API339 pass,7 optional integration skips; all8 package lint tasks pass.
