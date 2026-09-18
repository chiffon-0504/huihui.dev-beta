# Storage Management

Manage cookies, localStorage, sessionStorage, and browser storage state.

## Storage State

Save and restore complete browser state including cookies and storage. Authentication state can contain credentials and session tokens and must never be committed.

Use only `.playwright/auth/auth-state.json`, covered by the repository rule `/.playwright/auth/`. Before saving, provision the directory with access restricted to the current user through a repository-approved mechanism and run `git check-ignore -v .playwright/auth/auth-state.json`. If protected storage is unavailable, stop the save operation. Git ignore rules prevent accidental staging but do not restrict filesystem access.

Never pass passwords, tokens, API keys, or other secrets in CLI arguments, embedded code, or expanded environment variables. Use an already-authenticated session or repository-approved protected authentication mechanism. Do not print credential-bearing cookies or storage to tool output or logs; the inspection examples below are for non-sensitive state only.

### Save Storage State

```bash
# Save only to the protected, Git-ignored path
playwright-cli state-save .playwright/auth/auth-state.json
```

### Restore Storage State

```bash
# Load storage state from file
playwright-cli state-load .playwright/auth/auth-state.json

# Reload page to apply cookies
playwright-cli open https://example.com
```

### Storage State File Format

The saved file contains:

```json
{
  "cookies": [
    {
      "name": "theme",
      "value": "dark",
      "domain": "example.com",
      "path": "/",
      "expires": 1893456000,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "origins": [
    {
      "origin": "https://example.com",
      "localStorage": [
        { "name": "theme", "value": "dark" },
        { "name": "user_id", "value": "12345" }
      ]
    }
  ]
}
```

## Cookies

### List All Cookies

```bash
playwright-cli cookie-list
```

### Filter Cookies by Domain

```bash
playwright-cli cookie-list --domain=example.com
```

### Filter Cookies by Path

```bash
playwright-cli cookie-list --path=/api
```

### Get Specific Cookie

```bash
playwright-cli cookie-get theme
```

### Set a Cookie

```bash
# Basic cookie
playwright-cli cookie-set theme dark

# Cookie with options
playwright-cli cookie-set theme dark --domain=example.com --path=/ --httpOnly --secure --sameSite=Lax

# Cookie with expiration (Unix timestamp)
playwright-cli cookie-set theme dark --expires=1893456000
```

### Delete a Cookie

```bash
playwright-cli cookie-delete session_id
```

### Clear All Cookies

```bash
playwright-cli cookie-clear
```

### Advanced: Multiple Cookies or Custom Options

For complex scenarios like adding multiple cookies at once, use `run-code`:

```bash
playwright-cli run-code "async page => {
  await page.context().addCookies([
    { name: 'language', value: 'en', domain: 'example.com', path: '/' },
    { name: 'preferences', value: JSON.stringify({ theme: 'dark' }), domain: 'example.com', path: '/' }
  ]);
}"
```

## Local Storage

### List All localStorage Items

```bash
playwright-cli localstorage-list
```

### Get Single Value

```bash
playwright-cli localstorage-get theme
```

### Set Value

```bash
playwright-cli localstorage-set theme dark
```

### Set JSON Value

```bash
playwright-cli localstorage-set user_settings '{"theme":"dark","language":"en"}'
```

### Delete Single Item

```bash
playwright-cli localstorage-delete theme
```

### Clear All localStorage

```bash
playwright-cli localstorage-clear
```

### Advanced: Multiple Operations

For complex scenarios like setting multiple values at once, use `run-code`:

```bash
playwright-cli run-code "async page => {
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('user_id', '12345');
    localStorage.setItem('expires_at', Date.now() + 3600000);
  });
}"
```

## Session Storage

### List All sessionStorage Items

```bash
playwright-cli sessionstorage-list
```

### Get Single Value

```bash
playwright-cli sessionstorage-get form_data
```

### Set Value

```bash
playwright-cli sessionstorage-set step 3
```

### Delete Single Item

```bash
playwright-cli sessionstorage-delete step
```

### Clear sessionStorage

```bash
playwright-cli sessionstorage-clear
```

## IndexedDB

### List Databases

```bash
playwright-cli run-code "async page => {
  return await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases;
  });
}"
```

### Delete Database

```bash
playwright-cli run-code "async page => {
  await page.evaluate(() => {
    indexedDB.deleteDatabase('myDatabase');
  });
}"
```

## Common Patterns

### Authentication State Reuse

```bash
# Step 1: Use an already-authenticated session established through a
# repository-approved protected mechanism; do not enter credentials via CLI.

# Save the authenticated state
playwright-cli state-save .playwright/auth/auth-state.json

# Step 2: Later, restore state and skip login
playwright-cli state-load .playwright/auth/auth-state.json
playwright-cli open https://app.example.com/dashboard
# Already logged in!
```

### Save and Restore Roundtrip

```bash
# Set up non-sensitive demonstration state
playwright-cli open https://example.com
playwright-cli eval "() => { document.cookie = 'theme=dark'; localStorage.setItem('user', 'john'); }"

# Save state to file
playwright-cli state-save .playwright/auth/auth-state.json

# ... later, in a new session ...

# Restore state
playwright-cli state-load .playwright/auth/auth-state.json
playwright-cli open https://example.com
# Cookies and localStorage are restored!
```

## Security Notes

- Never commit storage state files containing auth tokens
- Save only to the protected `.playwright/auth/auth-state.json` path; verify it is Git-ignored before each save
- Delete state files after automation completes
- Never expand secrets from environment variables into commands or print them to logs
- By default, sessions run in-memory mode which is safer for sensitive operations
