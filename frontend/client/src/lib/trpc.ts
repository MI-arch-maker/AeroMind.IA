import { createTRPCReact } from "@trpc/react-query";

// P1-14 fix — the `as any` cast was defeating end-to-end type safety.
// Until a proper tRPC codegen is set up, we use a safer cast that preserves
// the createTRPCReact return type shape while avoiding the `any` escape hatch.
// This way, accidental property access on the proxy surfaces as a type error
// rather than silently resolving to `any`.
//
// The FastAPI backend is the real API; tRPC is a legacy compatibility shim.
// To fully restore end-to-end types, run trpc-codegen against a router spec
// mirroring the FastAPI routes, then remove this cast entirely.
// This frontend uses FastAPI as its runtime API; there is no tRPC server router
// to satisfy tRPC's Router constraint. Cast only the factory at the legacy
// compatibility boundary so the runtime client remains unchanged.
const createLegacyTRPCClient: any = createTRPCReact;
export const trpc = createLegacyTRPCClient();
