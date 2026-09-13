# Assignment source materials

Reviewed: 2026-09-11 UTC. These are the four files supplied by the user for the Spaceship Senior Engineer Code Test. They were read without modification for planning. The original binaries and CSV are not committed to this repository; this catalog identifies the user-supplied inputs for later implementation.

## Source hierarchy

1. The supplied Coding_assignment.docx gives the detailed numbered requirements, evaluation weights, optional bonuses and submission rules.
2. logistics-spec.docx and logistics-spec.pdf restate the core specification. They agree on mandatory functionality, weights and the 6–10 hour expectation. The shorter specification omits the detailed optional-bonus list; that omission does not make those bonuses mandatory.
3. The supplied mock_logistics_data.csv determines observable data facts. Definitions not established by its fields remain explicit project assumptions.
4. The reference solution is comparison material, not the assignment authority.

The user also supplied the Notion landing-page text listing the coding assignment, related materials and submission items: repository link, deployed app URL, and credentials if required. No submission deadline was included.

## Original files

| File | Role | Exact bytes | SHA-256 |
|---|---|---:|---|
| Coding_assignment.docx | Detailed assignment, including optional bonuses | 223275 | 97e2fb6e5eadf4f7a989f16ca7ea7e84bcf846519fab7fd9f3ba90adf9b155c9 |
| logistics-spec.docx | Word specification | 12995 | bd9bdac6cad0573745c57d3d40b332ed291ab320c4c60ee5670335017d04434d |
| logistics-spec.pdf | Four-page specification | 66091 | 2a67159a914feb3c81ae0b6d123c5a3193007e450b64242866439121a8f5c638 |
| mock_logistics_data.csv | Assigned read-only dataset | 57475 | b60f84b18aacc1a76b6d401ba0c290a0efd1f2729734224d65608e941594bc82 |

The CSV has Git blob dc20411f5b37c57af46f2ae42c0802d5a19d0ea9, matching the earlier audited reference fixture byte-for-byte. Future import code should use the user-supplied file from an explicit input path and verify this checksum.

## External links

| Source | Use |
|---|---|
| [Original Notion assignment](https://spaceshiphk.notion.site/Spaceship-Senior-Engineer-Code-Test-339ea40ff0c980789e69dfa21d3f6b24) | Landing page and original attachment location. This update uses the user-supplied page text/files; it does not claim a fresh Notion retrieval. |
| [Reference answer repository](https://github.com/KhresnaPanduI/spaceship-logistics-analytics) | Independent implementation for comparison. |
| [Pinned reference snapshot](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/tree/1c1ee718dc2ece3e9ad2296060721c7f948001e3) | Revision used by the earlier audit. |
| [Reference AI disclosure](https://github.com/KhresnaPanduI/spaceship-logistics-analytics/blob/1c1ee718dc2ece3e9ad2296060721c7f948001e3/AI_USAGE.md) | Reference author's disclosure, not a substitute for this project's own record. |

The source attachments are assignment materials, not a new open-source license grant. Preserve their provenance and do not apply a future application-code license to them by default. No reference implementation code is copied by this update. The existing repository visibility is unchanged.

## Reading guide

The application built from these sources keeps pure analytical rules in `src/domain/`, shared contracts and the runtime-neutral SQL port in `src/shared/`, data/bootstrap utilities in `src/data/`, and Cloudflare Worker adapters in `src/worker/`. The original files listed above remain supplied inputs and are not modified by that organization.

- [Requirement traceability](../requirements.md): exact source sections, required/optional status and planned evidence.
- [Data audit](../data-audit.md): verified counts, sparse history and explicit semantic assumptions.
- [Implementation plan](../../IMPLEMENTATION_PLAN.md): small submission scope and future work.
- [Submission checklist](../submission-checklist.md): repository, deployed URL and credentials state.
