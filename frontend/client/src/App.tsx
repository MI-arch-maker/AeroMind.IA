import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
// UX-09 fix: lazy-load heavy pages to reduce initial bundle (Home.tsx is 14k lines)
import Home from "@/pages/Home";
import { lazy, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";

// LABBENCH 01 is not a second application: its only entry point is the
// integrated Home workspace. Keep the legacy URL as an alias to that same
// shell so bookmarks cannot open a detached LabBench instance.
const SuperAdmin = lazy(() => import("@/pages/SuperAdmin"));

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
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
