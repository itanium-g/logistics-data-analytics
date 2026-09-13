# Submission checklist

Status: **Application implemented and verified locally. Not ready to submit: no deployed URL and no live model evaluation.** The brief requires a repository link, a deployed app URL and credentials if authentication is used. No deadline was supplied.

A ticked box below means it was executed on this machine and the result observed. Unticked boxes are genuinely outstanding.

## Handoff fields

| Item | Current value | Release action |
|---|---|---|
| Repository | [itanium-g/logistics-data-analytics](https://github.com/itanium-g/logistics-data-analytics) | Verify reviewer access. It is currently private; a link alone may not grant access. |
| Deployed app URL | Not deployed | Add the actual stable HTTPS URL after deploying and smoke-verifying it. |
| Credentials | Not created; no login in this profile | At release write "Not required", or provide tested credentials privately if access is later gated. |
| Deployed commit | Not available | Record the commit actually served by the deployment. |
| Data source | [Supplied CSV](assignment/README.md#original-files), SHA-256 verified at import | Confirm the deployed database holds data version 1.0.0, metric version 2. |
| Deadline | Not specified | Record only if later supplied. |

## Required product checks

- [x] Five required KPI cards show computed values and honest definitions. 400 / 304 / 55 / 84.68% / 3.69 days, with denominators and eligible counts shown.
- [x] At least two dashboard charts render and match the underlying tables. Monthly order volume and all five status counts; a test asserts the table carries every row the chart is given.
- [x] Dashboard and Ask use the same data and metric contracts. Both call the same domain functions; neither holds its own SQL or arithmetic.
- [x] AI routes both Query and Forecast and does not invent answers. Verified against a stubbed transport with the real adapter running; **not** verified against a live provider.
- [x] All three analytical examples work with visible date context. Weekly delayed orders summing to 10, GLS at 2/7, and 4 late deliveries on the delivery-date basis.
- [x] A known SKU returns four months of quantity forecasts. CRAYON-0008 returns January to April 2026.
- [x] Forecast includes history/future chart, numerical inventory target and methodology. Target 3 units, with the method, sample size and limitations shown.
- [x] Every answer and chart provides filters, metrics/dimensions and underlying data. Shared evidence panel plus the row table.
- [x] Exceptions, missing SLA dates, sparse SKUs and assumed coverage are disclosed.
- [x] Invalid, unsupported, empty, throttled and provider-error cases behave clearly. Distinct taxonomy codes with useful messages.

## Engineering and deployment checks

- [x] Focused numerical, date and forecast tests pass against the supplied dataset. 195 tests in 11 files.
- [x] Model outputs are validated; raw model SQL cannot execute. Prose, unknown tools, a `raw_sql` key, injected identifiers and two populated branches all execute nothing.
- [x] Supplied analytical data remains read-only through request paths. No route writes to `orders`; only the usage table is written.
- [ ] Twenty-case live acceptance results and limitations recorded. Cases are frozen in `evals/cases.json` but **have not been executed**.
- [x] Provider keys are server-side; no secrets in Git or built assets. The built bundle contains no key value, no provider endpoint and no `Authorization` header.
- [x] Free quota and timeout controls work, including concurrent admission. Five concurrent requests for one slot admit exactly one.
- [x] Clean-checkout setup commands have actually been executed successfully. `npm ci`, import, migrate, seed, typecheck, test, build, smoke.
- [x] Source layout and ignore rules have been reviewed. Runtime-neutral SQL contracts are separated from the Worker D1 adapter; data/bootstrap modules are isolated under `src/data/`; secrets, generated output, local state, caches and supplied assignment originals are gitignored.
- [ ] Public app is usable from a fresh browser without local setup. Requires deployment.
- [x] Data table, API 404 behaviour and keyboard reachability checked. JSON 404 for unknown API paths including navigations; controls are focusable with no negative tab index.
- [ ] Desktop and mobile checked on a real deployment. Responsive CSS exists and the jsdom mount test passes, but no device testing has been done.
- [ ] Actual hosting limits and deployed data/revision match documentation. Free-tier CPU fit is unmeasured.
- [ ] Repository access for reviewers verified using the intended handoff method.
- [x] If authentication is used, credentials work. Not applicable: no authentication in this profile.
- [x] Rollback and provider-disable instructions recorded. Setting `LLM_ENABLED` to `"false"` disables questions while leaving analytics working; restoring data never restores usage counters.

## README and disclosure checks

- [x] Local setup and exact environment variables, as actually executed.
- [x] Architecture, key decisions and data flow.
- [x] Question interpretation and selection of the two tools.
- [x] Assumptions, simplifications and unsupported queries.
- [x] Limitations and concrete future improvements.
- [ ] Actual deployed URL and access instructions. Pending deployment.
- [x] [AI_USAGE.md](../AI_USAGE.md) updated for the actual implementation assistance, including the defects the checks caught.
- [x] Original assignment and reference links preserved.

## Remaining work before submission

1. Deploy: create a real D1 database, replace the all-zero placeholder id, apply migrations and seed remotely, set the provider secret, deploy, and record the served commit.
2. Execute the 20 frozen evaluation cases against the live provider and record actual counts, failures, tokens and latency.
3. Verify the public URL from a fresh browser and on a mobile viewport.
4. Verify reviewer access to the private repository.
