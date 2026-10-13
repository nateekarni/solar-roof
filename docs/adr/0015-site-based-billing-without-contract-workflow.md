# ADR 0015: Site-based billing without contract workflow

Status: Accepted for the target design, 2026-10-09. Not implemented.

## Context

The customer confirmed that this product creates sites and configures their service, rather than managing contracts. Existing rates, terms, recipients and document views depend on contracts. Merely hiding the menu would preserve the wrong workflow and make users maintain an unnecessary record.

## Decision

Owner creates a site and manages its billing configuration: customer document identity, rates, collection/reminder settings and related service values. Admin manages customer records and gateway/device configuration and has no financial document access. There is one gateway per site.

Replace the contract workflow with site billing configuration across UI, API, persistence and background processing. A system tariff catalog supplies rates for application and customization per site. Preserve explicit site tariff history when rates change. Billing is created and issued automatically; Owner can change rates for unpaid billing, with exact effective-date and document-revision behavior still under interview.

The customer permits restructuring existing development code and removing obsolete flows rather than retaining compatibility with the contract workflow. This is not authorization to delete databases, user data or issued document history indiscriminately.

## Consequences

The design must migrate contract-dependent calculation, terms, recipients, local test bindings, document metadata and dashboards to the site model. Contracts stop being a prerequisite for site activation or billing. The implementation plan will identify the transition and tests together, rather than leave two business models active.

Rate-edit semantics, schedule timing, recipient rules and representative site assignments remain explicit follow-up decisions; this ADR does not settle them.
