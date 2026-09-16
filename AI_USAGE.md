# AI assistance disclosure

AI tools were used during development of this assignment. The final repository, analytical definitions, tests, and deployment configuration were reviewed by the author.

| Area | Assistance used |
|---|---|
| Research and planning | ChatGPT-assisted assignment analysis, architecture comparison, and technology research. |
| Implementation | Kiro CLI, Codex, and Antigravity CLI assisted with scaffolding, source code, refactoring, tests, and Cloudflare configuration. |
| UI review | Codex and browser-development tools assisted with responsive layout review and screenshot capture. |
| Documentation | AI assistance helped organize the requirements, setup instructions, assumptions, validation notes, and this disclosure. |

The application's own AI feature is separate from the tools used to build it. At runtime, native Cloudflare Workers AI selects one validated operation. The application then performs the query or forecast deterministically; it does not trust the model to calculate or invent analytical values.

No reference implementation code was intentionally copied. The supplied assignment files are used as inputs and remain excluded from Git.
