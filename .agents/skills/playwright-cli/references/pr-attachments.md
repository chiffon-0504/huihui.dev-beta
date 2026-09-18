# Attaching Screenshots and Videos to Pull Requests

`gh` 2.99+ uploads local images and videos with the repeatable `--attach` flag on `gh pr create`, `gh pr comment`, `gh pr edit`, `gh issue create`, `gh issue comment` and `gh issue edit`. PNG, JPEG, GIF, WebP, SVG, MP4, MOV and WebM are accepted, so `playwright-cli screenshot` and `video-start` output can be attached as is.

## Required capability gate

Media attachment is optional. Before using any `--attach` example in this Skill, run `gh --version` and inspect help for the exact operation you intend to use:

```bash
gh --version
gh pr create --help
gh pr comment --help
gh issue comment --help
```

Proceed only with GitHub CLI 2.99+ **and** `--attach` present in that exact command's help (also check the matching help for edit or issue-create operations). Version parsing alone is not sufficient.

The review reported 2.96.0; the latest check in this repository environment on 2026-09-18 detected 2.97.0. Neither provides `--attach`; all three command help checks above lacked the flag. In this environment, do not execute attachment commands. Keep screenshots/videos local under ignored `.playwright-cli/`, report that media publication was skipped because the installed GitHub CLI lacks the capability, and continue unrelated PR work. If visual evidence is mandatory and cannot be omitted, report the missing capability instead of inventing another upload mechanism. Do not install or upgrade GitHub CLI automatically.

All attachment examples below are conditional on this gate and separately authorized publication.

## When to attach

Attach visual evidence when it saves the reviewer a checkout: a screenshot of a UI fix, a before/after pair, a short video of a new user-facing flow, or the failure state when filing a bug. Skip it for refactors, backend-only changes and anything the diff already shows.

## From a local session

```bash
# capture the evidence
playwright-cli open http://localhost:3000/settings
playwright-cli screenshot --filename=.playwright-cli/settings-after.png
playwright-cli video-start .playwright-cli/settings-flow.webm
playwright-cli click e5
playwright-cli fill e7 "New name" --submit
playwright-cli video-stop

# attach when creating the PR; alt text goes after "#" (images only)
gh pr create --title "fix(settings): keep name after save" --body-file body.md \
  --attach '.playwright-cli/settings-after.png#Settings page after saving' --attach .playwright-cli/settings-flow.webm

# or comment on an existing PR / issue
gh pr comment 123 --body "Recorded the new flow end to end." --attach .playwright-cli/settings-flow.webm
gh issue comment 456 --body "Failure state after submitting the form." --attach .playwright-cli/failure.png
```

Reference the file in the body as `![alt](.playwright-cli/settings-after.png)` to place it inline and `gh` rewrites the path to the uploaded URL. Unreferenced attachments are appended at the end in flag order.

## Limits

- Images up to 10 MB, videos up to 10 MB on free plans and 100 MB on paid plans, so keep recordings short.
- Alt text is not supported on videos.
- Uploads need push access to the repository.
- Available on GitHub.com and GitHub Enterprise Cloud only.

## From CI

The optional attachment step checks the runner capability before publishing artifacts from `test-results`. An unsupported runner skips only this step; the preceding test step retains its original failure status (no `continue-on-error` or test-status override). No CLI installation or upgrade is performed.

```yaml
permissions:
  pull-requests: write
steps:
  - run: npx playwright test
  - name: Attach failure screenshots and videos to the PR
    if: failure() && github.event_name == 'pull_request'
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      gh_version=$(gh --version) || {
        echo "Media attachment skipped: GitHub CLI version unavailable."
        exit 0
      }
      printf '%s\n' "$gh_version"
      gh_number=$(printf '%s\n' "$gh_version" | head -1 | awk '{print $3}')
      if ! printf '%s\n' "$gh_number" | awk -F. 'NF == 3 && $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ && ($1 > 2 || ($1 == 2 && $2 >= 99)) { ok=1 } END { exit !ok }'; then
        echo "Media attachment skipped: GitHub CLI 2.99+ is required."
        exit 0
      fi
      attach_help=$(gh pr comment --help) || {
        echo "Media attachment skipped: command help unavailable."
        exit 0
      }
      if ! printf '%s\n' "$attach_help" | grep -q -- '--attach'; then
        echo "Media attachment skipped: gh pr comment lacks --attach."
        exit 0
      fi
      files=$(find test-results -name '*.png' -o -name '*.webm' | head -20)
      if [ -n "$files" ]; then
        gh pr comment ${{ github.event.pull_request.number }} \
          --body "Failure screenshots and videos from run ${{ github.run_id }}." \
          $(printf -- '--attach %s ' $files)
      fi
```

For a polished walkthrough of a new feature, record a hero script as described in [video-recording.md](video-recording.md) and attach the resulting WebM the same way.
