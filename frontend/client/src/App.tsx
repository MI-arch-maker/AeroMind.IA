import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
// UX-09 fix: lazy-load heavy pages to reduce initial bundle (Home.tsx is 14k lines)
import Home from "@/pages/Home";
import { lazy, Suspense, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Spinner } from "@/components/ui/spinner";
import VirtualParametricFactory from "@/pages/VirtualParametricFactory";

// LABBENCH 01 is not a second application: its only entry point is the
// integrated Home workspace. Keep the legacy URL as an alias to that same
// shell so bookmarks cannot open a detached LabBench instance.
const SuperAdmin = lazy(() => import("@/pages/SuperAdmin"));
const AuditJournal = lazy(() => import("@/pages/AuditJournal"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="w-8 h-8" />
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    </div>
  );
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/labbench" component={Home} />
      <Route path="/engineering-hub" component={Home} />
      <Route path="/virtual-factory" component={VirtualParametricFactory} />
      <Route path="/admin">
        <Suspense fallback={<PageLoader />}>
          <SuperAdmin />
        </Suspense>
      </Route>
      <Route path="/super-admin">
        <Suspense fallback={<PageLoader />}>
          <SuperAdmin />
        </Suspense>
      </Route>
      <Route path="/audit-journal">
        <Suspense fallback={<PageLoader />}>
          <AuditJournal />
        </Suspense>
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [watermark, setWatermark] = useState({ enabled: true, opacity: 0.045, size: 520 });
  useEffect(() => {
    const readSettings = () => {
      try {
        const saved = localStorage.getItem("aeromind-watermark-settings");
        if (saved) {
          const value = JSON.parse(saved);
          setWatermark({
            enabled: value.enabled !== false,
            opacity: Math.min(0.15, Math.max(0.01, Number(value.opacity) || 0.045)),
            size: Math.min(900, Math.max(180, Number(value.size) || 520)),
          });
        }
      } catch { /* Keep safe defaults when browser storage is unavailable. */ }
    };
    readSettings();
    window.addEventListener("aeromind-watermark-settings-changed", readSettings);
    window.addEventListener("storage", readSettings);
    return () => {
      window.removeEventListener("aeromind-watermark-settings-changed", readSettings);
      window.removeEventListener("storage", readSettings);
    };
  }, []);
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <div className="aeromind-app-shell">
              <div
                className="aeromind-watermark"
                aria-hidden="true"
                style={{ display: watermark.enabled ? "block" : "none", opacity: watermark.opacity, "--aeromind-watermark-size": `${watermark.size}px` } as CSSProperties}
              />
              <Router />
              <footer className="aeromind-brand-footer" aria-label="Identité AeroMind">
                <img src="/aeromind-logo.svg" alt="" />
                <span>AEROMIND</span>
                <small>Intelligence · Ingénierie · Aéronautique</small>
              </footer>
            </div>
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
