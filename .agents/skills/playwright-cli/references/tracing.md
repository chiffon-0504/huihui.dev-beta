# Tracing

Capture detailed execution traces for debugging and analysis. Traces include DOM snapshots, screenshots, network activity, and console logs.

## Repository safety rule

Traces can contain Cookie and Authorization headers, session identifiers, CSRF tokens, private request/response bodies, DOM data, screenshots, and console output. Do not use `tracing-start` on authenticated, credential-bearing, private, or otherwise sensitive sessions. Use only public unauthenticated pages, local fixtures, or synthetic data without reusable credentials.

A future authenticated-tracing exception requires separate explicit authorization and an approved protected-storage/redaction procedure. This Skill provides no automatic redaction. The Git-ignored `.playwright-cli/` directory only prevents accidental staging; it does not make sensitive traces safe. These restrictions apply to every tracing example in this Skill.

## Basic Usage

```bash
# Open a fresh non-sensitive session before recording
playwright-cli open https://example.com
playwright-cli tracing-start

# Perform actions
playwright-cli click e1
playwright-cli fill e2 "test"

# Stop trace recording
playwright-cli tracing-stop
```

## Trace Output Files

When you start tracing, Playwright creates a `.playwright-cli/traces/` directory with several files:

### `trace-{timestamp}.trace`

**Action log** - The main trace file containing:
- Every action performed (clicks, fills, navigations)
- DOM snapshots before and after each action
- Screenshots at each step
- Timing information
- Console messages
- Source locations

### `trace-{timestamp}.network`

**Network log** - Complete network activity:
- All HTTP requests and responses
- Request headers and bodies
- Response headers and bodies
- Timing (DNS, connect, TLS, TTFB, download)
- Resource sizes
- Failed requests and errors

### `resources/`

**Resources directory** - Cached resources:
- Images, fonts, stylesheets, scripts
- Response bodies for replay
- Assets needed to reconstruct page state

## What Traces Capture

| Category | Details |
|----------|---------|
| **Actions** | Clicks, fills, hovers, keyboard input, navigations |
| **DOM** | Full DOM snapshot before/after each action |
| **Screenshots** | Visual state at each step |
| **Network** | All requests, responses, headers, bodies, timing |
| **Console** | All console.log, warn, error messages |
| **Timing** | Precise timing for each operation |

## Use Cases

### Debugging Failed Actions

```bash
playwright-cli open https://example.com
playwright-cli tracing-start

# This click fails - why?
playwright-cli click e5

playwright-cli tracing-stop
# Open trace to see DOM state when click was attempted
```

### Analyzing Performance

```bash
playwright-cli open https://example.com
playwright-cli tracing-start
playwright-cli tracing-stop

# View network waterfall to identify slow resources
```

### Capturing Evidence

```bash
# Record a public, non-sensitive search flow
playwright-cli open https://example.com/search
playwright-cli tracing-start
playwright-cli fill e1 "public documentation"
playwright-cli click e2

playwright-cli tracing-stop
# Trace shows exact sequence of events
```

## Trace vs Video vs Screenshot

| Feature | Trace | Video | Screenshot |
|---------|-------|-------|------------|
| **Format** | .trace file | .webm video | .png/.jpeg image |
| **DOM inspection** | Yes | No | No |
| **Network details** | Yes | No | No |
| **Step-by-step replay** | Yes | Continuous | Single frame |
| **File size** | Medium | Large | Small |
| **Best for** | Debugging | Demos | Quick capture |

## Best Practices

### 1. Start Tracing Before the Problem

```bash
# Trace the entire flow, not just the failing step
playwright-cli open https://example.com
playwright-cli tracing-start
# ... all steps leading to the issue ...
playwright-cli tracing-stop
```

### 2. Clean Up Old Traces

Traces can consume significant disk space:

```bash
# Remove traces older than 7 days
find .playwright-cli/traces -mtime +7 -delete
```

## Limitations

- Traces add overhead to automation
- Large traces can consume significant disk space
- Some dynamic content may not replay perfectly
