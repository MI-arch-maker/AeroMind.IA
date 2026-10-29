import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

// P1-14 fix — the `as any` cast was defeating end-to-end type safety.
// Until a proper tRPC codegen is set up, we use a safer cast that preserves
// the createTRPCReact return type shape while avoiding the `any` escape hatch.
// This way, accidental property access on the proxy surfaces as a type error
// rather than silently resolving to `any`.
//
// The FastAPI backend is the real API; tRPC is a legacy compatibility shim.
// To fully restore end-to-end types, run trpc-codegen against a router spec
// mirroring the FastAPI routes, then remove this cast entirely.
type TRPCProxy = ReturnType<typeof createTRPCReact<AppRouter>>;
export const trpc = createTRPCReact<AppRouter>() as unknown as TRPCProxy;
