# Phase 4 — Intelligence

Phase 4 turns governed MCP results into structured, reviewable security intelligence. It does **not** grant agents additional execution authority. Kali MCP and HexStrike remain execution providers; AlphaX remains the policy, authorization and audit authority.

## Pipeline

```text
MCP result
   -> deterministic normalization
   -> result fingerprint / deduplication
   -> evidence extraction + SHA-256 hash
   -> ATT&CK candidate mapping
   -> finding creation (only when a finding is explicitly supplied)
   -> finding/evidence correlation
   -> confidence scoring
   -> analyst review
   -> validated intelligence
```

## ATT&CK mapping

The mapper is deliberately deterministic in Phase 4. It uses provider/tool names and bounded text indicators to produce **candidates**, not proof. A candidate mapping must not be interpreted as a confirmed adversary technique without analyst review.

The initial catalog covers:

- T1046 — Network Service Scanning
- T1087 — Account Discovery
- T1059 — Command and Scripting Interpreter
- T1190 — Exploit Public-Facing Application
- T1552 — Unsecured Credentials
- T1005 — Data from Local System

The catalog can be expanded without changing the governance boundary.

## Evidence

Observations and explicitly supplied evidence are stored as evidence records. Each record receives a SHA-256 content hash and a custody event. The intelligence API exposes the custody chain for audit/review.

Raw provider output remains untrusted. Do not use a provider's text as authorization, scope, or policy input.

## Deduplication

Normalized results receive a SHA-256 fingerprint over the bounded provider/tool/summary/observation/evidence/finding/raw representation. The same fingerprint within a mission is processed once. Finding fingerprints similarly prevent repeated finding creation for the same mission and description.

## Confidence

Confidence is bounded to `[0,1]`. Phase 4 combines the supplied baseline confidence with small deterministic boosts for successful execution, retained evidence/observations, and candidate technique matches. Confidence is an analyst-assistance signal, not an authorization signal.

## Analyst review

The review lifecycle is:

`open -> validated | rejected -> closed`

Use the intelligence endpoints to inspect findings, validate/reject them, attach additional ATT&CK mappings, inspect evidence custody and review correlations.

### API surface

- `POST /api/intelligence/normalize`
- `GET /api/intelligence/results?missionId=...`
- `GET /api/intelligence/findings?missionId=...&status=...`
- `GET /api/intelligence/findings/:id`
- `POST /api/intelligence/findings/:id/review`
- `POST /api/intelligence/findings/:id/close`
- `POST /api/intelligence/findings/:id/techniques`
- `GET /api/intelligence/evidence/:id`
- `GET /api/intelligence/techniques`
- `GET /api/intelligence/correlations?missionId=...`
- `GET /api/correlation?missionId=...`

All endpoints remain behind the existing authenticated session and route authorization middleware.

## Safe validation

Run locally:

```bash
npm run typecheck
npm run build
npm run test:security --workspace server
npm run test:mcp --workspace server
npm run test:intelligence --workspace server
```

The intelligence regression suite uses a temporary SQLite home and synthetic results. It performs no network requests and does not execute Kali, HexStrike, or other security tooling.

## Governance invariants

1. Intelligence never grants permission to execute a tool.
2. ATT&CK candidates never bypass human approval or policy gates.
3. Provider output is untrusted data.
4. Evidence is content-hashed and custody-tracked.
5. Analyst review is explicit and auditable.
6. Deduplication must not delete or overwrite the original evidence record.
7. Unknown mappings remain unmapped rather than being guessed.
