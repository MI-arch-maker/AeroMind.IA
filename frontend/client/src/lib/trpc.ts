import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

// Le backend de production est FastAPI; le routeur tRPC ne sert ici que de
// compatibilité pour les écrans legacy. Le cast évite que l’absence de schéma
// tRPC généré bloque le build TypeScript du cockpit.
export const trpc = createTRPCReact<AppRouter>() as any;
