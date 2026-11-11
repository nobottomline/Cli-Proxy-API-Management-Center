# Upstream maintenance

Reviewed on 2026-11-11 against upstream `953fb24` (2026-11-05).
The public fork uses the MIT license and keeps `stable` as its default branch.

## Selected fixes

These source changes and their regression tests were backported without replacing
this fork's Ledger view or session-window extension:

- `7db1d7d`: secure reset request IDs on HTTP pages without `crypto.randomUUID`.
- `6f01129` and integration `3961a80`: clear only the redeemed credential's proxy
  cooldown after a confirmed reset. Preserve the settled grant if local recovery
  fails; never repeat the spend to repair a cooldown.
- `a6a8606`, `b412f69`, `e2d335b`: anchor Claude's weekly timeline on the account
  window, measure fill against the full window, and respect local calendar/DST
  boundaries. These changes include the associated model and rendering tests.
- Plan detection from `dad572d`: distinguish Max 5x from Max 20x using the profile's
  rate-limit tier, while preserving active Team organization precedence.
- `eb8cbb4`, `24f78e8`: render every plugin-declared OAuth entry and decode escaped
  metadata while retaining the plugin's declared provider validation.
- `38990ae`, `eea7482`: update Grok client headers and fix toolbar search padding.
- Storage fix `1650cf2`: remove user-agent dependence from newly obfuscated values
  and retire legacy saved login credentials without silently migrating them.
  Users must enter their management key once after updating. Browser storage
  obfuscation remains reversible and is not encryption or a security boundary.
  Auth storage regression tests are adapted to the existing login UI.

The new routing editor, login redesign, campaign cards and provider expansion were
not imported: they add separate product surfaces and are not dependencies of these
fixes. The backend was not upgraded and its configuration was not changed.

## Subscription terminology

Claude's API still reports `default_claude_max_20x`. Retain the existing internal
`plan_max20` key for cached observations, display it as **Ultra** in all supported
locales, and rank it above **Max** (`plan_max5` / `plan_max`) and **Pro**.
This is a display order and never changes inference routing priorities.

Source: [Claude Help Center: What is the Ultra plan?](https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan).
Unknown plans remain unknown. Do not infer subscriptions from names or email
addresses, or reinterpret a missing quota window as a full allowance.

## Verification

Run `bun run verify` and inspect Ledger, Cards and timeline in a browser against
`scripts/demo-server.py`. Its six fictional credentials mix Pro, Max and Ultra
profiles, use only synthetic data, and reject provider mutations. Check privacy
across refreshes, reloads, both views, keyboard interaction and reduced motion.

Verified locally: 1,729 Bun tests, ESLint, TypeScript and the single-file production
build passed; all 12 optional helper tests passed. Browser checks used the
synthetic fixture at desktop and mobile widths, in light/dark themes: tier order,
privacy in Ledger/Cards/timeline and refresh notifications, local persistence
after reload, remembered sign-in, keyboard toggling and reduced motion passed.
The design detector reported no findings. Unsupported dashboard requests in the
minimal fixture return 404; no live provider mutations were used for verification.

## Ultra session limits and explicit reset selection

The follow-up imports `d06a110`'s explicit reset chooser, grant type/Fable metadata,
zero-usage handling, and the original-grant journal for uncertain outcomes. It
keeps this fork's private identity labels and wires the dialog into Ledger as well
as Cards. Grant rows add a shared-minute-clock countdown, an exact expiration date,
and future availability; expiration sorting does not preselect or spend a grant.
A confirmed claim rechecks eligibility against the provider and uses exactly the
selected grant ID. Ambiguous claims retain their original grant and request ID.

The current upstream still has no distinct uncapped Claude five-hour state. The
fork classifies a session as uncapped only for a reported Ultra/Max-20x profile
with explicit `five_hour: null`, valid weekly usage, and a valid `limits` array
without a session limit. Missing, malformed or contradictory evidence does not
produce infinity. A real session window always wins over the plan name. Existing
snapshot retention preserves this observation during refresh/error states; stale
observations keep their visible stale marker. Cards and Ledger use a shared
uncapped display without percentage-meter semantics, and disable the individual
session-start button for accounts that have no session window.

Primary references:

- [Claude: verified Ultra accounts have no five-hour limit](https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan).
- [First-hand usage payload and client behavior](https://github.com/akitaonrails/ai-usagebar/issues/566).
- [Claude: limit reset types and expiration](https://support.claude.com/en/articles/17007452-what-is-a-limit-reset).

Verification: 1,761 Bun tests, ESLint, TypeScript and the production build passed.
Browser checks use synthetic capped/uncapped Ultra profiles and three grants,
including a future unavailable grant. Ledger/Cards, mobile/desktop, privacy,
countdowns, and keyboard selection were checked. A locally intercepted synthetic
claim verified that opening/selecting never spends and confirmation sends only the
chosen Fable grant, rather than the provider's recommended full reset. No real
reset grants were consumed during testing.

Synthetic previews: [uncapped session](screenshots/claude-uncapped.png) and
[reset chooser](screenshots/claude-reset-chooser.png).
