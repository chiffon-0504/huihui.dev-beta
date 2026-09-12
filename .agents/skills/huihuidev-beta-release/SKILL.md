---
name: huihuidev-beta-release
description: Execute explicitly authorized huihuidev-beta stable promotion, version tags, production deployment, or GitHub Release publication. Excludes ordinary development PR publication and read-only release audits.
---

# Execute an authorized release

## Authorization

Loading this Skill grants no release permission. Apply [AGENTS.md](../../../AGENTS.md),
including its [authorization boundaries](../../../AGENTS.md#skill-authorization-boundaries).
Establish the authorized operations and targets from the user's request: stable
promotion, tag creation, GitHub Release creation, production Worker dispatch,
remote configuration changes, and real Contact submission are distinct scopes.
Do not infer one from another or expand a partial release request to all stages.

## Completion evidence

Read the canonical [README Deployment Flow](../../../README.md#deployment-flow)
for the applicable stage and its prerequisites before acting. It alone owns the
release sequence, beta/stable promotion, Pages/Worker/tag/Release ordering and
rollout compatibility. Use its stage-specific checks, not historical universal
beta/stable equality assumptions.

For each authorized stage, retain evidence that:

- The exact candidate SHA, merged-PR containment and required CI match the
  intended release; freshly verify identity and applicable preconditions before
  each write, applying [Fresh baseline](../../../AGENTS.md#fresh-baseline-requirement)
  and [release safety](../../../AGENTS.md#release-stage-boundaries).
- Stable ancestry and applicable divergence checks pass; never force-push stable.
- Tags resolve to the intended commit. Never move or overwrite a conflicting tag.
  On resume, accept an existing step only after its identity matches; for a tag
  or Release, apply AGENTS.md's repository, version, peeled target, tag type and
  Release-state checks. This completes only that step.
- Deployment identities match the candidate SHA and authorized production smoke
  evidence satisfies the applicable acceptance gates. Push success alone is
  insufficient to claim release acceptance.

Select validation under [AGENTS.md](../../../AGENTS.md#validation) and use
[CONTRIBUTING.md](../../../CONTRIBUTING.md#validation-coverage) for commands and
coverage, including v1/v2; follow linked subsystem requirements when applicable.

Stop the affected operation on an unexpected or unverifiable safety result.
Report each stage as verified, not requested, or blocked, with supporting evidence;
do not turn historical one-off exceptions into permanent exemptions. Consult
current tool documentation for an encountered failure rather than importing
historical troubleshooting into the release sequence.
