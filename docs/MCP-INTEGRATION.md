# AlphaX MCP Integration Model

AlphaX treats external MCP systems as governed tool providers, not trusted executors.

## Providers

Two first-class provider profiles are supported by design:

- `kali` — Kali Linux MCP tool provider
- `hexstrike` — HexStrike AI MCP tool provider

Configure their endpoints through environment variables or the deployment layer. Do not commit credentials or tokens.

## Trust boundary

```text
AI Agent / Planner
        |
        v
AlphaX Mission + Policy Engine
        |
        +-- identity / RBAC
        +-- project scope
        +-- risk policy
        +-- approval gate
        +-- safety stop
        +-- audit
        |
        v
AlphaX MCP Gateway
        |
   +----+----+
   |         |
 Kali MCP  HexStrike MCP
   |         |
   +----+----+
        |
     Tools
```

## Tool admission

Every external tool must be registered with:

- provider/server ID
- tool name
- input schema
- required permission
- risk level
- read-only flag
- enabled state

AlphaX should not automatically import or execute arbitrary tools from a newly discovered server. Discovery is followed by an explicit registration/admission step.

## Safety rules

1. External MCP credentials are secrets and must never be committed.
2. Tool schemas are untrusted input and must be validated before use.
3. Targets must be checked against project scope.
4. Risk policy is evaluated immediately before execution, not only during planning.
5. Human approval is required whenever policy says so.
6. The global execution stop must block external tool execution.
7. Every invocation and result must be auditable.
8. Provider-specific protocol details must be implemented only after confirming the provider's actual transport contract; AlphaX does not assume that a local endpoint is necessarily standard JSON-RPC-over-HTTP.
9. MCP endpoints are host-allowlisted. By default only loopback hosts are permitted; remote endpoints require `ALPHAX_MCP_ALLOWED_HOSTS` and HTTPS.
10. Remote MCP credentials are supplied only through deployment secrets and are never stored in the MCP registry.
11. HTTP redirects are rejected to prevent an allowlisted endpoint from redirecting requests to another host.
12. Responses are size-limited and must be valid JSON-RPC 2.0 responses.

## Environment contract

```text
ALPHAX_KALI_MCP_URL=
ALPHAX_HEXSTRIKE_MCP_URL=
ALPHAX_KALI_MCP_TOKEN=
ALPHAX_HEXSTRIKE_MCP_TOKEN=
ALPHAX_GENERIC_MCP_TOKEN=
ALPHAX_MCP_ALLOWED_HOSTS=localhost,127.0.0.1,::1
ALPHAX_MCP_TIMEOUT_MS=30000
```

For remote providers, replace the default host allowlist with the exact provider hostnames or IP addresses required by the deployment. Never use a broad wildcard allowlist.
