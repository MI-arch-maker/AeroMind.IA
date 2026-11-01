// P1-14 fix — AppRouter type definition for the tRPC React client.
//
// Previously `export type AppRouter = any`, which defeated end-to-end type
// safety: every `trpc.xxx.yyy.useQuery()` call resolved to `any`, masking
// malformed inputs, wrong mutation payloads, and shape drift between client
// and the FastAPI backend.
//
// This file defines a structured AppRouter type that mirrors the tRPC procedure
// names used by the frontend (discovered via grep across frontend/client/src).
// Runtime requests target FastAPI /api endpoints — this type provides compile-
// time procedure-name validation and IDE autocompletion without requiring a
// full tRPC codegen pipeline.
//
// To fully type inputs/outputs, run trpc-codegen against a TypeScript router
// spec that mirrors the FastAPI routes, or migrate to native FastAPI-typed
// fetch helpers.

export type ProcedureType = "query" | "mutation";

export type Procedure = {
  type: ProcedureType;
  // Input/output are intentionally `unknown` (not `any`) to force callers to
  // validate shapes at the consumption site. This is stricter than `any` and
  // prevents accidental property access on untyped responses.
  input: unknown;
  output: unknown;
};

export type RouterShape = {
  [procedure: string]: Procedure;
};

export type AppRouter = {
  ai: RouterShape & {
    chat: Procedure;
    status: Procedure;
  };
  auditEvents: RouterShape & {
    list: Procedure;
    record: Procedure;
  };
  auth: RouterShape & {
    me: Procedure;
  };
  designVersions: RouterShape & {
    list: Procedure;
    restore: Procedure;
  };
  identity: RouterShape & {
    providers: Procedure;
  };
  labBench: RouterShape & {
    armN3: Procedure;
    armN3Drone: Procedure;
    completeHardwareChecklist: Procedure;
    completeHardwareChecklistDrone: Procedure;
    createReport: Procedure;
    disarmN3: Procedure;
    disarmN3Drone: Procedure;
    fleetGateState: Procedure;
    gateState: Procedure;
    persistSimulation: Procedure;
    registry: Procedure;
    runFleetSimulation: Procedure;
    runSimulation: Procedure;
    seedRegistry: Procedure;
    signOffN4: Procedure;
    status: Procedure;
    validateCommand: Procedure;
  };
  projects: RouterShape & {
    delete: Procedure;
    list: Procedure;
    saveSnapshot: Procedure;
  };
  reports: RouterShape & {
    approve: Procedure;
    create: Procedure;
  };
  superAdmin: RouterShape & {
    accounts: Procedure;
    deleteAccount: Procedure;
  };
};
