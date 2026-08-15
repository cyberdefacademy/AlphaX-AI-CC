# MITRE ATT&CK, Findings and Evidence

## Goal

The intelligence layer turns raw tool output into structured security observations without pretending that a tool result is automatically a confirmed finding.

## Data flow

```text
Tool output
  -> normalized observation
  -> confidence assessment
  -> ATT&CK candidate mapping
  -> finding correlation
  -> evidence record
  -> analyst review
```

## ATT&CK mapping

A technique mapping should include:

- technique ID
- technique name
- tactic
- source observation
- confidence
- mission/task correlation ID
- timestamp
- analyst/agent attribution

Use confidence levels such as `low`, `medium`, `high`, and `confirmed`. A model-generated mapping should normally remain a candidate until supported by sufficient evidence.

## Findings

A finding should have:

- stable ID
- title
- severity
- affected asset
- scope
- evidence references
- ATT&CK references
- status
- owner
- created/updated timestamps

## Evidence

Evidence should be immutable once recorded. Store a cryptographic digest of the source artifact and preserve provenance:

```text
mission -> task -> tool invocation -> receipt -> artifact -> finding
```

Do not store secrets or unnecessary personal data in evidence. Redact credentials, session cookies and unrelated sensitive content before long-term retention.

## Analyst workflow

1. Review normalized observations.
2. Inspect supporting evidence.
3. Validate affected asset and scope.
4. Confirm or reject ATT&CK candidate mappings.
5. Create or update finding.
6. Record remediation/next action.
7. Close only when evidence supports closure.

## Quality rules

- Never infer exploitation solely from a model statement.
- Preserve original timestamps and source IDs.
- Keep evidence provenance intact.
- Distinguish observation, inference and confirmed finding.
- Prefer deterministic parser output over free-form model extraction when possible.
