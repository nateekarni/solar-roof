# Separate customer presentation from staff operations UI

The customer portal now targets a mobile-first consumer billing experience, while the staff application remains a dense operational workspace. Reusing staff page compositions would couple customer design changes to owner, admin, accountant, and operator workflows, so customer routes will render a dedicated customer component and view-model boundary while continuing to share neutral UI primitives, authentication, domain services, and existing APIs where their contracts fit.

New customer data needs will be served through role- and site-scoped customer projections or backward-compatible optional fields. Staff endpoint semantics and staff presentation must not change as a side effect of the customer redesign. This accepts some presentation duplication in exchange for independent evolution, clearer security review, and lower back-office regression risk.

