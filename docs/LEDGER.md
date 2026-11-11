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
- `ledgerModel.ts`: remaining percentages, public identity and the latest recovery among exhausted shared pools.
- `QuotaLedger.tsx`: provider summaries and Claude rows, with existing cards as a
  complete fallback for other providers. Unreported Fable allowance remains `--`.
- `QuotaPage.tsx`: retains filtering, sorting, pagination, connection generations,
  cache invalidation and the existing timeline. Ledger reads visible idle quotas
  once; failed reads do not enter an automatic retry loop. Cards keeps its old
  click-to-load behavior. Calendar names agree with Ledger account labels.
- `MainLayout.tsx`: Ledger has its own collapsed-sidebar state. Switching to Cards
  or another route restores the independent existing sidebar state.

The provider summary contains only the provider and credential count; Fable
allowances remain per account. Default sorting uses reported subscriptions in
descending order: Ultra, Max, Pro, then other or unknown plans. A persistent
Hide emails switch masks account identities in both views, timeline tooltips and
action messages. The placeholder shimmers briefly and respects reduced motion.
No hidden email is rendered into text, titles or accessible names. Identity
uses the public label/email/filename; `account` and `account_type` are never used
for display because those fields can contain API credentials.

## Actions

Refresh quota delegates to the existing per-credential quota action and its cache
and connection guards. Banked Reset limits opens the grant chooser and delegates to the reset-grant
hook, journal, ambiguity handling and fresh preflight. Every grant shows its
expiration and a live countdown; the chosen identity is never silently replaced. The optional session-window
control uses its existing private loopback helper. A view switch never performs
inference, spends a reset or changes routing.

See [upstream maintenance notes](UPSTREAM.md) for backported fixes and current
Claude subscription terminology.

## Verification

Pure regressions cover unknown/clamped remaining allowance, subscription ordering,
shared-pool recovery, private identity and storage failure. Rendering regressions
cover missing Fable data, errors and duplicate-read blocking. The full existing
Bun suite, lint, typecheck and single-file build remain required. Optional helper
Python regressions use synthetic credentials and never call a provider.

`scripts/demo-server.py` provides synthetic account, quota/profile and reset-grant
observations to the compiled UI. The browser can exercise refresh, search, view
and privacy persistence, per-account details and timeline controls with no external requests.
The fixture records reads in `/fixture-counts` and refuses all provider mutations.
Do not substitute real accounts or credentials into published test fixtures or
screenshots. Production verification must be limited to authenticated read-only
quota operations; consuming banked reset grants is not a verification step.


## Release qualification: v1.26.7-ledger.2

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

The initial CI run exposed a pre-existing locale/order-sensitive cooldown test:
English apostrophes in an HTML title must be compared after React attribute
encoding. The assertion was corrected without changing runtime cooldown behavior.

## Details disclosure positioning

The ellipsis summary keeps native disclosure semantics. `QuotaDetails.tsx` portals
the read-only panel outside the row and anchors it to the summary's viewport
rectangle rather than the full account row. The panel aligns its trailing edge
with the trigger, uses an 8px gap, clamps to 16px viewport margins, and flips above
when there is more space. Its own content scrolls within the available height.
Scroll, resize and content-size changes update positioning; moving the trigger
out of view closes the panel. Pointer interaction outside closes it, and Escape
returns keyboard focus to the summary. The panel sits above page navigation and
below reset confirmation dialogs.

Browser regression checks used synthetic accounts at 1440px, 900px and 390px
widths: an 8px trigger gap, trailing-edge alignment on desktop, bottom-row upward
placement, viewport containment, scroll tracking, keyboard toggling, Escape focus
restoration and outside-click dismissal. No provider calls or resets were used.
