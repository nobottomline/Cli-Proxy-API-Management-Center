# CLI Proxy API Management Center fork

## Platform
Web: React 19, TypeScript, Vite, Bun 1.3.14. The production artifact is one
`management.html`, hosted by the existing CLIProxyAPI v8 management server.

## Purpose and users
Account owners inspect subscription limits, reset times and credential health,
and refresh provider observations without changing inference routing.

## Confirmed constraints
- Preserve the installed v1.26.7 baseline outside the quota surface.
- Make the screenshot-inspired Ledger quota view the default. Retain the exact
  existing Cards view and a persistent, reversible view switch.
- Use real provider observations; unknown values remain unknown. Percentages show
  remaining allowance, not usage. A quota refresh is a read, a banked reset spends
  a grant after confirmation, and starting a session window is a separate action.
- Preserve management authentication, connection-generation guards, quota cache,
  all providers, ISP transport, and the optional manual session-window extension.
- Do not store credentials, real account fixtures or private deployment data here.

## Visual commitment
The user's supplied quota screenshot defines the Ledger composition: compact
search/sort/view toolbar, provider summary, flat credential rows, three aligned
Claude quota columns, right-aligned actions, and the existing quota timeline.
Only this route receives the alternate composition. Existing theme selection,
navigation and all other pages remain available.
