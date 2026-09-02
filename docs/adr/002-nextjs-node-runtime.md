# ADR-002: Next.js App Router and Node runtime

## Status

Accepted

## Context

The application needs server-rendered workflows, server-controlled data access, and a small operational footprint.

## Decision

Use the current stable Next.js App Router on the Node.js runtime with strict TypeScript. Prefer Server Components; use Client Components only for necessary browser interaction. Same-origin mutations will use Server Actions where appropriate, with Route Handlers for protocol-oriented endpoints.

## Consequences

UI and server code share one type system and deployment. Every Server Action and Route Handler remains a public security boundary and must validate, authenticate, and authorize independently. Node-specific dependencies are allowed only in server modules.
