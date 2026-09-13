# Shared application types

Reserved for application types shared by multiple v2 features. Add exported
types when concrete callers need them, and consume them with `import type`.
Keep feature-local types with their modules; no domain models or ambient
application globals are introduced by the foundation setup.
