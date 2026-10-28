# Ledger implementation

## Scope

The fork freezes the installed v1.26.7 frontend baseline. It adds one alternate
composition for `/quota`, keeps the original Cards rendering branch, and migrates
the existing compact session-window controls into source control. The backend
API, OAuth files, inference configuration, account priorities and network routes
are not changed by the UI. The original MIT attribution and upstream history
remain in the repository.

`main` is the upstream branch captured when the fork was created. `stable`, based
on tag v1.26.7, is this fork's default working branch; unrelated later upstream
changes were not silently installed. Future upstream updates should be reviewed
and merged explicitly.

## Rendering and data

- `viewPreference.ts`: validated, persistent Ledger/Cards preference; defaults to
  Ledger, remains usable without browser storage, and contains no account data.
- `ledgerModel.ts`: remaining percentages, public identity, honest partial
  aggregates and the latest recovery among exhausted shared pools.
- `QuotaLedger.tsx`: provider summaries and Claude rows, with existing cards as a
  complete fallback for other providers. Unreported Fable allowance remains `--`.
- `QuotaPage.tsx`: retains filtering, sorting, pagination, connection generations,
  cache invalidation and the existing timeline. Ledger reads visible idle quotas
  once; failed reads do not enter an automatic retry loop. Cards keeps its old
  click-to-load behavior. Calendar names agree with Ledger account labels.
- `MainLayout.tsx`: Ledger has its own collapsed-sidebar state. Switching to Cards
  or another route restores the independent existing sidebar state.

The provider summary adds account percentages, not tokens or pooled subscription
capacity. The hint explains that different plans do not share a budget. Identity
uses the public label/email/filename; `account` and `account_type` are never used
for display because those fields can contain API credentials.

## Actions

Refresh quota delegates to the existing per-credential quota action and its cache
and connection guards. Banked Reset limits delegates to the original reset-grant
hook, journal, ambiguity handling and confirmation. The optional session-window
control uses its existing private loopback helper. A view switch never performs
inference, spends a reset or changes routing.

## Verification

Pure regressions cover unknown/clamped remaining allowance, partial aggregates,
shared-pool recovery, safe identity and storage failure. Rendering regressions
cover missing Fable data, errors and duplicate-read blocking. The full existing
Bun suite, lint, typecheck and single-file build remain required. Optional helper
Python regressions use synthetic credentials and never call a provider.

`scripts/demo-server.py` provides synthetic account, quota/profile and reset-grant
observations to the compiled UI. The browser can exercise refresh, search, view
persistence, summary/details and timeline controls with no external requests.
The fixture records reads in `/fixture-counts` and refuses all provider mutations.
Do not substitute real accounts or credentials into published test fixtures or
screenshots. Production verification must be limited to authenticated read-only
quota operations; consuming banked reset grants is not a verification step.


## Release qualification: v1.26.7-ledger.1

- 1,667 Bun tests passed; ESLint, TypeScript and the single-file production build passed.
- All 12 optional helper Python regressions passed; deployment/demo scripts compiled.
- The compiled UI was exercised against the isolated synthetic backend at
  1448 × 972, 1280 × 720 and 390 × 844. No page-level horizontal overflow.
- Ledger and Cards switching survives reload. Search, provider breakdown,
  per-account details, calendar navigation and weekly/session selection passed.
- Refreshing Studio caused exactly one additional quota read for Studio and no
  quota reads for the other accounts. No model requests or reset grants were used.
- Reset confirmation was opened and cancelled. No reset claim was submitted.
- The optional design detector could not start because its local engine binary
  was unavailable; two bounded manual screenshot rounds supplied visual review.

Screenshots in this repository contain only fixture accounts. Live gateway
qualification is read-only and recorded separately from the public test fixture.
