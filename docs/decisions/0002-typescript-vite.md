# ADR-0002: TypeScript + Vite

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

Tuning game feel needs very fast edit-reload loops. Client and server share message formats and constants, so drift between them causes subtle bugs.

## Decision

- Client: **TypeScript (strict mode)** built with **Vite**.
- Server: **TypeScript on Node.js**.
- Network message types and shared constants live in a shared module imported by both.

## Alternatives considered

- **Plain JavaScript:** faster to start, but loses type safety across the client/server boundary.
- **Webpack / Parcel:** slower dev loop than Vite.

## Consequences

- One language across the project, and shared types catch protocol mismatches at compile time.
- Requires a build step. Deployment serves the built static client.
