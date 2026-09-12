---
name: huihuidev-beta-publish
description: Prepare or publish scoped huihuidev-beta development changes when the user explicitly requests branch, commit, push, or PR work. Excludes ordinary coding, read-only Git analysis, and stable promotion or version releases.
---

# Publish scoped development changes

## Authorization

Loading this Skill grants no write permission. Apply [AGENTS.md](../../../AGENTS.md)
and its [authorization boundaries](../../../AGENTS.md#skill-authorization-boundaries).
A generic coding request does not authorize commit, push, force-push, PR creation,
PR merge, stable changes, or deployment. Preparation alone does not authorize
publication. Perform only the operations and targets already authorized.

Force-push requires explicit authorization for the specific branch. Rebase, a
stale base, non-fast-forward rejection, or failed push does not supply it; follow
AGENTS.md's safe next action when that write is blocked.

## Completion evidence

For the requested operations, establish:

- The publication diff and eventual PR contain only the authorized scope;
  preserve unrelated user changes.
- The mandatory [Fresh baseline](../../../AGENTS.md#fresh-baseline-requirement)
  gates are satisfied at the applicable operations, and freshness remains valid
  before push or PR creation.
- Relevant validation is complete under [AGENTS.md selection principles](../../../AGENTS.md#validation),
  using [CONTRIBUTING.md commands and coverage](../../../CONTRIBUTING.md#validation-coverage),
  including the applicable v1/v2 distinction.
- Before an authorized commit, explicit staged paths and the staged diff match
  the approved scope; account for unrelated pre-existing staged changes.
- After authorized publication, verify the remote branch SHA, PR base/head,
  changed-file scope and requested lifecycle state against the intended result.

Report completed operations, evidence and remaining blockers without implying
that unrequested publication steps are pending obligations. Diagnose tool or
authentication failures only when encountered; historical recipes are not policy.

For explicitly authorized stable promotion or release operations, use
[Release](../huihuidev-beta-release/SKILL.md) and the canonical
[README Deployment Flow](../../../README.md#deployment-flow).
