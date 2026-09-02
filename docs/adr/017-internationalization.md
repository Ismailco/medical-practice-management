# ADR-017: Internationalization architecture

## Status

Accepted

## Context

English is the initial language, with French and Arabic including right-to-left layout planned later.

## Decision

Keep user-facing messages outside domain logic, set document language and direction explicitly, use logical CSS properties where practical, and format dates/numbers through locale-aware APIs. Do not translate the Phase 0 interface or add a localization library before routing and catalog requirements are implemented.

## Consequences

English delivery stays small while the component structure remains RTL-aware. Full Arabic support will still require translated catalogs, bidirectional testing, suitable fonts, and special verification of generated prescription PDFs.
