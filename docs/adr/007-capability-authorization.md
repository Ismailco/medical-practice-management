# ADR-007: Capability-based authorization

## Status

Accepted

## Context

V1 has two roles, but direct role comparisons scattered through route and domain code would make future policy review difficult and increase accidental disclosure risk.

## Decision

Define an explicit, centralized role-to-capability mapping and authorize server operations with `requireSession`, `requireUser`, and `requireCapability`. Client input never supplies role or capabilities. Secretary creation hard-codes `SECRETARY`; the one doctor is operator-created.

## Consequences

Policy is testable in one place and denial behavior is consistent. Resource-level checks will still be required inside future domain services; possessing a capability alone will never make an arbitrary object identifier trustworthy.
