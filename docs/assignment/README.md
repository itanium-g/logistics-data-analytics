# Assignment source materials

This repository was built for the [Spaceship Senior Engineer Code Test](https://spaceshiphk.notion.site/Spaceship-Senior-Engineer-Code-Test-339ea40ff0c980789e69dfa21d3f6b24). The original attachments were supplied for implementation and are not committed to this public repository.

## Original files

| File | Purpose |
|---|---|
| `Coding_assignment.docx` | Detailed requirements, evaluation criteria, optional bonuses, and submission rules. |
| `logistics-spec.docx` | Word version of the core specification. |
| `logistics-spec.pdf` | PDF version of the core specification. |
| `mock_logistics_data.csv` | Assigned read-only dataset used by the application. |

The CSV is expected at `docs/assignment/mock_logistics_data.csv` for local setup. It is ignored by Git because it is a user-provided assignment input. The importer verifies its schema, control totals, and SHA-256 before generating seed data.

## Source priority

1. The detailed coding assignment is the primary requirement source.
2. The Word and PDF specifications corroborate the core requirements.
3. The CSV determines the observable data facts.
4. The [reference repository](https://github.com/KhresnaPanduI/spaceship-logistics-analytics) is comparison material only; its code is not a dependency of this project.

## Related documents

- [Assignment coverage](../requirements.md)
- [Dataset facts and assumptions](../data-audit.md)
- [Architecture notes](../architecture/implementation-plan.md)
- [Submission checklist](../submission-checklist.md)
