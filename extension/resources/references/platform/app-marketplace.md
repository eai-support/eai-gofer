# Distributable Application Contract

Gofer treats a distributable app as a product that another tenant administrator
can review, purchase, install and safely operate in their own tenant. It remains
separate from a private app and from trusted EAI-owned embedded packages.

Before Gofer produces `eai.application.json`, it records:

- publisher and buyer value;
- `isolated-hosted` runtime placement;
- exact interactive and workload capabilities using `eai.app_capabilities.v1`;
- data purpose, classification, geography, retention, export and deletion;
- services and exact stored Object Type slugs;
- pricing/terms, support/SLA, evidence, upgrade and rollback.

Gofer rejects secrets, direct provider credentials/routes, impersonation,
wildcard capabilities, mutable artifact tags and unbounded data movement.
Generated files are preparation evidence only. Marketplace readiness requires an
approved platform listing and a READY buyer installation; Gofer cannot grant
either authority locally.
