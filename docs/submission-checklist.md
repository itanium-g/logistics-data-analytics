# Submission checklist

Status: **Not ready to submit. Documentation and source review only.** The brief requires repository link, deployed app URL and credentials if authentication is used. No deadline was supplied.

## Handoff fields

| Item | Current value | Release action |
|---|---|---|
| Repository | [itanium-g/logistics-data-analytics](https://github.com/itanium-g/logistics-data-analytics) | Verify reviewer access. It is currently private; a link alone may not grant access. |
| Deployed app URL | Not deployed | Add the actual stable HTTPS URL after implementation and smoke verification. |
| Credentials | Not created; no login planned for synthetic demo | At release write “Not required”, or provide tested credentials privately if access is gated. |
| Deployed commit | Not available | Record the commit actually served by the deployment. |
| Data source | [Supplied CSV](assignment/README.md#original-files) | Verify imported checksum and data/metric version. |
| Deadline | Not specified | Record only if later supplied by the recruiter/user. |

## Required product checks

- [ ] Five required KPI cards show computed values and honest definitions.
- [ ] At least two dashboard charts render and match the underlying tables.
- [ ] Dashboard and Ask use the same data and metric contracts.
- [ ] Live AI routes both Query and Forecast; it does not invent answers.
- [ ] All three analytical examples work with visible date context.
- [ ] A known SKU returns four months of quantity forecasts.
- [ ] Forecast includes history/future chart, numerical inventory target and methodology.
- [ ] Every answer/chart provides filters, metrics/dimensions and underlying data/summary.
- [ ] Exceptions, missing SLA dates, sparse SKUs and assumed coverage are disclosed.
- [ ] Invalid, unsupported, empty, throttled and provider-error cases behave clearly.

## Engineering and deployment checks

- [ ] Focused numerical/date/forecast tests pass against the supplied dataset.
- [ ] Model outputs are validated; raw model SQL cannot execute.
- [ ] Supplied analytical data remains read-only through request paths.
- [ ] Twenty-case live acceptance results and limitations are recorded.
- [ ] Provider keys are server-side; no secrets in Git or built assets.
- [ ] Free quota and timeout controls work, including concurrent admission.
- [ ] Clean-checkout setup commands have actually been executed successfully.
- [ ] Public app is usable from a fresh browser without local setup.
- [ ] Desktop/mobile, keyboard, data table and API 404 behavior checked.
- [ ] Actual hosting limits and deployed data/revision match documentation.
- [ ] Repository access for reviewers verified using the intended handoff method.
- [ ] If authentication is used, credentials work and are delivered through the intended channel.
- [ ] Rollback and provider-disable instructions recorded.

## README and disclosure checks

- [ ] Local setup and exact environment variables.
- [ ] Architecture, key decisions and data flow.
- [ ] Question interpretation and selection of the two tools.
- [ ] Assumptions, simplifications and unsupported queries.
- [ ] Limitations and concrete future improvements.
- [ ] Actual deployed URL, data version and access instructions.
- [ ] [AI_USAGE.md](../AI_USAGE.md) updated for actual implementation assistance and verification.
- [ ] Original assignment and reference links preserved.

The landing-page submission block is a deliverable specification, not an instruction to submit to the employer during this planning update. No recruiter message or employer submission has been sent.
