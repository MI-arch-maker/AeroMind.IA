import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Activity, AlertTriangle, Bell, ChevronDown, ClipboardCheck, Edit, FileText, FolderKanban, KeyRound, LayoutDashboard, LogIn, LogOut, Plus, Save, Search, Settings, ShieldCheck, SlidersHorizontal, Trash2, Users, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { bearerHeaders, clearSessionToken } from "@/lib/sessionToken";
import { startLogin } from "@/const";
import { OperationModeCard } from "@/components/OperationModeCard";
import { useLanguage } from "../contexts/LanguageContext";

type Role = "user" | "demo" | "visitor" | "surveillant" | "admin";
type AuthUser = { email: string; name?: string; role?: string; level?: string; account_status?: string };
type Section = "overview" | "accounts" | "approvals" | "projects" | "reports" | "levels" | "audit" | "settings";
type SortKey = "email" | "role" | "status" | "name";
type SortDir = "asc" | "desc";

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", amber: "bg-amber-50 text-amber-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", slate: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone] || tones.slate}`}>{children}</span>;
}

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function SuperAdmin() {
  const { t } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [level, setLevel] = useState("L1");
  const [filter, setFilter] = useState("Tous");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [authorizationCodeNotice, setAuthorizationCodeNotice] = useState<{ email: string; code?: string; localEnrollmentCode?: string; dailyTotpCode?: string; dailyTotpCodeDate?: string; dailyTotpValidUntilUtc?: string } | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [pendingRegs, setPendingRegs] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [approvalDialog, setApprovalDialog] = useState<{ email: string; name: string; code?: string } | null>(null);
  const [editSuperAdmin, setEditSuperAdmin] = useState<{ id: string; name: string; email: string } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("email");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const roleLabel: Record<string, string> = {
    user: t("Utilisateur"),
    demo: t("Démo"),
    visitor: t("Visiteur"),
    surveillant: t("Surveillant"),
    admin: t("ADMIN"),
    super_admin: t("SUPER-ADMIN"),
  };
  const statusLabel: Record<string, string> = {
    active: t("Actif"),
    evaluation: t("Évaluation"),
    suspended: t("Suspendu"),
    cancelled: t("Alerte / conformité"),
  };
  const filterOptions = [
    t("Tous"),
    t("Utilisateur"),
    t("Démo"),
    t("Visiteur"),
    t("Surveillant"),
    t("ADMIN"),
    t("SUPER-ADMIN"),
  ];

  const refreshSession = async () => {
    setAuthLoading(true);
    try {
      const response = await fetch("/api/auth/oidc/me", { credentials: "include", headers: bearerHeaders() });
      setUser(response.ok ? (await response.json() as AuthUser) : null);
    } catch { setUser(null); } finally { setAuthLoading(false); }
  };
  useEffect(() => {
    void refreshSession();
    const handler = () => void refreshSession();
    window.addEventListener("aeromind-auth-changed", handler);
    return () => window.removeEventListener("aeromind-auth-changed", handler);
  }, []);

  // Live session timer — gives the console a real "active session" feel.
  useEffect(() => {
    const start = Date.now();
    const tick = () => setSessionSeconds(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Keyboard shortcuts: F5 to refresh queries, "/" to focus the search input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
        setActiveSection("accounts");
      } else if (e.key === "F5") {
        e.preventDefault();
        void invalidate();
        toast.info(t("Console actualisée"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accounts = trpc.superAdmin.accounts.useQuery(undefined, { enabled: !!user, retry: false });
  const activity = trpc.superAdmin.activity.useQuery(undefined, { enabled: !!user, retry: false });
  const reports = trpc.reports.list.useQuery(undefined, { enabled: !!user, retry: false });
  const invalidate = async () => Promise.all([utils.superAdmin.accounts.invalidate(), utils.superAdmin.activity.invalidate(), utils.reports.list.invalidate()]);

  const fetchPending = async () => {
    setPendingLoading(true);
    try {
      const response = await fetch("/api/auth/local/admin/pending-registrations", {
        credentials: "include", headers: bearerHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setPendingRegs(data.pending || []);
      }
    } catch { /* ignore */ } finally { setPendingLoading(false); }
  };

  const approveRegistration = async (email: string, name: string) => {
    try {
      const response = await fetch("/api/auth/local/admin/approve-registration", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...bearerHeaders() },
        body: JSON.stringify({ email, action: "approve", reason: "Approved via console" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || t("Approbation refusée."));
      setApprovalDialog({ email, name, code: result.enrollment_code });
      toast.success(t("Inscription approuvée"), { description: t("Code d'inscription généré. Transmettez-le à l'utilisateur.") });
      await fetchPending();
    } catch (error: any) {
      toast.error(t("Approbation impossible"), { description: error.message });
    }
  };

  const rejectRegistration = async (email: string) => {
    const reason = window.prompt(`${t("Motif du rejet (optionnel) :")}`) || "";
    try {
      const response = await fetch("/api/auth/local/admin/approve-registration", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...bearerHeaders() },
        body: JSON.stringify({ email, action: "reject", reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || t("Rejet refusé."));
      toast.success(t("Inscription rejetée"));
      await fetchPending();
    } catch (error: any) {
      toast.error(t("Rejet impossible"), { description: error.message });
    }
  };

  useEffect(() => {
    if (user && activeSection === "approvals") void fetchPending();
  }, [user, activeSection]);

  useEffect(() => { if (user) void fetchPending(); }, [user]);

  const create = trpc.superAdmin.createAccount.useMutation({
    onSuccess: async (created: any) => {
      toast.success(t("Compte créé"), { description: t("Connexion via Entra ou inscription locale avec mot de passe et TOTP.") });
      if (created?.authorizationCode || created?.localEnrollmentCode) setAuthorizationCodeNotice({ email: created.email, code: created.authorizationCode, localEnrollmentCode: created.localEnrollmentCode });
      setEmail(""); setName(""); setShowCreate(false); await invalidate();
    },
    onError: e => toast.error(t("Création refusée"), { description: e.message }),
  });
  const update = trpc.superAdmin.updateAccount.useMutation({
    onSuccess: async () => { toast.success(t("Autorisation mise à jour")); await invalidate(); },
    onError: e => toast.error(t("Modification refusée"), { description: e.message }),
  });
  const remove = trpc.superAdmin.deleteAccount.useMutation({
    onSuccess: async (result: any) => {
      toast.success(result?.permanentlyDeleted ? t("Compte supprimé définitivement") : t("Compte placé en alerte"), {
        description: result?.permanentlyDeleted ? t("La trace d'audit est conservée.") : t("Une mise en conformité est requise avant suppression définitive."),
      });
      await invalidate();
    },
    onError: e => toast.error(t("Suppression refusée"), { description: e.message }),
  });
  const rotateCode = trpc.superAdmin.rotateAuthorizationCode.useMutation({
    onSuccess: async (updated: any) => {
      if (updated?.authorizationCode || updated?.localEnrollmentCode) setAuthorizationCodeNotice({ email: updated.email, code: updated.authorizationCode, localEnrollmentCode: updated.localEnrollmentCode });
      toast.success(t("Code régénéré"), { description: t("L'ancien code est immédiatement révoqué.") });
      await invalidate();
    },
    onError: e => toast.error(t("Rotation impossible"), { description: e.message }),
  });
  const resetLocal = trpc.superAdmin.resetLocalAuth.useMutation({
    onSuccess: async (updated: any) => {
      setAuthorizationCodeNotice({ email: updated.email, localEnrollmentCode: updated.localEnrollmentCode });
      toast.success(t("Accès local réinitialisé"), { description: t("Le mot de passe et le TOTP précédents sont révoqués.") });
      await invalidate();
    },
    onError: e => toast.error(t("Réinitialisation impossible"), { description: e.message }),
  });
  const issueDailyCode = trpc.superAdmin.issueDailyTotpCode.useMutation({
    onSuccess: async (issued: any) => {
      setAuthorizationCodeNotice({ email: issued.email, dailyTotpCode: issued.dailyTotpCode, dailyTotpCodeDate: issued.dailyTotpCodeDate, dailyTotpValidUntilUtc: issued.dailyTotpValidUntilUtc });
      toast.success(t("Code quotidien attribué"), { description: t("Valable jusqu'à la fin du jour UTC et vérifié par Aeromind.") });
      await invalidate();
    },
    onError: e => toast.error(t("Attribution impossible"), { description: e.message }),
  });
  const approve = trpc.reports.approve.useMutation({
    onSuccess: async () => { toast.success(t("Rapport approuvé")); await invalidate(); },
    onError: e => toast.error(t("Approbation impossible"), { description: e.message }),
  });
  const projectAction = (action: "save" | "observe" | "delete") => trpc.superAdmin[`${action}Project`].useMutation({
    onSuccess: async () => {
      toast.success(action === "save" ? t("Projet sauvegardé") : action === "observe" ? t("Projet placé en observation") : t("Projet supprimé"));
      await invalidate();
    },
    onError: e => toast.error(t("Action projet refusée"), { description: e.message }),
  });
  const saveProject = projectAction("save");
  const observeProject = projectAction("observe");
  const deleteProject = projectAction("delete");

  // --- Super-Admin-specific mutations (override regular security restrictions) ---
  const updateSuperAdmin = trpc.superAdmin.updateSuperadminAccount.useMutation({
    onSuccess: async (updated: any) => {
      toast.success(t("Super-Admin mis à jour"), { description: t("Les modifications ont été enregistrées et journalisées.") });
      setEditSuperAdmin(null);
      await invalidate();
      // Refresh the session to pick up the new email
      await refreshSession();
    },
    onError: e => toast.error(t("Modification Super-Admin refusée"), { description: e.message }),
  });
  const deleteSuperAdmin = trpc.superAdmin.deleteSuperadminAccount.useMutation({
    onSuccess: async (result: any) => {
      toast.success(result?.permanentlyDeleted ? t("Super-Admin supprimé définitivement") : t("Super-Admin placé en alerte"), {
        description: result?.permanentlyDeleted ? t("La trace d'audit est conservée. La session sera déconnectée.") : t("Une mise en conformité est requise avant suppression définitive."),
      });
      await invalidate();
      if (result?.permanentlyDeleted) {
        // Force logout after definitive delete of own super-admin account
        await logout();
      }
    },
    onError: e => toast.error(t("Suppression Super-Admin refusée"), { description: e.message }),
  });
  const resetSuperAdminLocal = trpc.superAdmin.resetSuperadminLocalAuth.useMutation({
    onSuccess: async (updated: any) => {
      setAuthorizationCodeNotice({ email: updated.email, localEnrollmentCode: updated.localEnrollmentCode });
      toast.success(t("Accès local Super-Admin réinitialisé"), { description: t("Le mot de passe et le TOTP précédents sont révoqués.") });
      await invalidate();
    },
    onError: e => toast.error(t("Réinitialisation Super-Admin impossible"), { description: e.message }),
  });
  const rotateSuperAdminCode = trpc.superAdmin.rotateSuperadminAuthorizationCode.useMutation({
    onSuccess: async (updated: any) => {
      if (updated?.authorizationCode || updated?.localEnrollmentCode) {
        setAuthorizationCodeNotice({ email: updated.email, code: updated.authorizationCode, localEnrollmentCode: updated.localEnrollmentCode });
      }
      toast.success(t("Code Super-Admin régénéré"), { description: t("L'ancien code est immédiatement révoqué.") });
      await invalidate();
    },
    onError: e => toast.error(t("Rotation Super-Admin impossible"), { description: e.message }),
  });

  const logout = async () => {
    setLogoutBusy(true);
    try {
      await fetch("/api/auth/oidc/logout", { method: "POST", credentials: "include", headers: bearerHeaders() });
      clearSessionToken();
      setUser(null);
      await utils.reset();
      toast.success(t("Session fermée"));
    } finally { setLogoutBusy(false); }
  };
  const issueLocalInvite = async () => {
    if (!window.confirm(t("Cette action révoquera les identifiants locaux actuels, le cas échéant, et émettra une nouvelle invitation. L'accès Entra reste inchangé. Continuer ?"))) return;
    try {
      const response = await fetch("/api/auth/local/admin/enrollment-invite", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...bearerHeaders() }, body: "{}" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || t("Impossible de préparer l'accès local."));
      setAuthorizationCodeNotice({ email: result.email, localEnrollmentCode: result.localEnrollmentCode });
      toast.success(t("Invitation locale créée"), { description: t("Usage unique · mot de passe et TOTP obligatoires.") });
    } catch (error: any) { toast.error(t("Accès local indisponible"), { description: error.message }); }
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("asc"); }
  };

  const rows = useMemo(() => {
    const base = (accounts.data || []).filter((a: any) => {
      const label = roleLabel[a.role] || a.role;
      const matchesFilter = filter === t("Tous") || label === filter;
      const matchesSearch = `${a.name} ${a.email}`.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
    const dirMul = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a: any, b: any) => {
      const va = String(a[sortBy] ?? (sortBy === "name" ? a.name : sortBy === "status" ? a.accountStatus : a.email)).toLowerCase();
      const vb = String(b[sortBy] ?? (sortBy === "name" ? b.name : sortBy === "status" ? b.accountStatus : b.email)).toLowerCase();
      if (va < vb) return -1 * dirMul;
      if (va > vb) return 1 * dirMul;
      return 0;
    });
  }, [accounts.data, filter, search, sortBy, sortDir, roleLabel, t]);

  const denied = !!user && (user.role !== "super_admin" || accounts.error?.data?.code === "FORBIDDEN");
  const adminEvents = (activity.data?.adminEvents || activity.data?.activity || []) as any[];
  const recentAdminEvents = adminEvents.slice(0, 5);
  const notificationEvents = adminEvents.slice(0, 3);

  if (authLoading) return <AuthShell><p className="text-sm text-slate-500">{t("Vérification de la session Super-Admin…")}</p></AuthShell>;
  if (!user) return <AuthShell><ShieldCheck className="mb-4 text-blue-600" size={38} /><h1 className="text-2xl font-bold">{t("Connexion console AeroMind")}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{t("Choisissez Microsoft Entra ou l'accès local sécurisé préalablement activé par le Super-Admin. Les comptes locaux exigent un mot de passe et un code d'application TOTP.")}</p><button onClick={() => startLogin()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><LogIn size={17} />{t("Continuer avec Microsoft Entra")}</button><div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t("OU ACCÈS LOCAL MFA")}<span className="h-px flex-1 bg-slate-200" /></div><LocalAuthPanel onAuthenticated={refreshSession} /><Link href="/" className="mt-5 block text-center text-xs font-semibold text-slate-500 hover:text-blue-600">{t("Retour au cockpit")}</Link></AuthShell>;
  if (denied) return <AuthShell><ShieldCheck className="mb-4 text-red-500" size={38} /><h1 className="text-2xl font-bold">{t("Accès refusé")}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{t("Cette session n'est pas le Super-Admin autorisé.")}</p><button onClick={() => void logout()} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700"><LogOut size={16} /> {t("Se déconnecter")}</button></AuthShell>;

  const totals = activity.data?.totals || {};
  const databaseType = (accounts.data?.length || 0) > 0 ? "SQLite / PostgreSQL" : "SQLite";
  const sectionTitle: Record<Section, string> = {
    overview: t("Vue d'ensemble"),
    accounts: t("Comptes & accès"),
    approvals: t("Approbations"),
    projects: t("Projets"),
    reports: t("Rapports à valider"),
    levels: t("Niveaux & quotas"),
    audit: t("Journal d'audit"),
    settings: t("Paramètres"),
  };

  const navItems: { id: Section; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: t("Vue d'ensemble"), icon: <LayoutDashboard size={17} /> },
    { id: "accounts", label: t("Comptes & accès"), icon: <Users size={17} /> },
    { id: "approvals", label: t("Approbations"), icon: <ClipboardCheck size={17} />, badge: pendingRegs.length },
    { id: "projects", label: t("Projets"), icon: <FolderKanban size={17} /> },
    { id: "reports", label: t("Rapports à valider"), icon: <ClipboardCheck size={17} /> },
    { id: "levels", label: t("Niveaux & quotas"), icon: <SlidersHorizontal size={17} /> },
    { id: "audit", label: t("Journal d'audit"), icon: <Activity size={17} /> },
    { id: "settings", label: t("Paramètres"), icon: <Settings size={17} /> },
  ];
  const mobileNav: [Section, string][] = [
    ["overview", t("Vue d'ensemble")],
    ["accounts", t("Comptes")],
    ["approvals", t("Approbations")],
    ["projects", t("Projets")],
    ["reports", t("Rapports")],
    ["levels", t("Niveaux")],
    ["audit", t("Audit")],
    ["settings", t("Paramètres")],
  ];

  return <main className="min-h-screen bg-[#f5f7fa] text-[#10243a]"><div className="flex min-h-screen">
    <aside className="hidden w-64 shrink-0 flex-col bg-[#10243a] px-5 py-6 text-white lg:flex">
      <Link href="/" className="flex items-center gap-3"><span className="grid h-9 w-9 skew-x-[-8deg] place-items-center border border-blue-300 text-2xl italic text-blue-300">A</span><span><strong className="block tracking-[.18em]">AEROMIND</strong><small className="text-[9px] uppercase tracking-[.22em] text-blue-200">{t("Console Super-Admin")}</small></span></Link>
      <div className="my-8 h-px bg-white/10" />
      <nav className="space-y-1 text-sm">{navItems.map(item => <Nav key={item.id} active={activeSection === item.id} icon={item.icon} label={item.label} onClick={() => { setActiveSection(item.id); if (item.id === "reports") setShowReports(true); }} badge={item.badge} />)}</nav>
      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck size={15} className="text-blue-300" />
          {t("Session sécurisée")}
          <span className="ml-auto inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
        </div>
        <p className="mt-2 break-all leading-5 text-slate-400">{user.email}</p>
        <span className="mt-2 inline-flex rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-blue-200">{t("SUPER-ADMIN")}</span>
        <button onClick={() => void logout()} disabled={logoutBusy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"><LogOut size={14} />{logoutBusy ? t("Déconnexion…") : t("Se déconnecter")}</button>
      </div>
    </aside>
    <section className="min-w-0 flex-1">
      {/* Thin top status bar — gives the console a "live session" feel */}
      <div className="flex items-center gap-3 border-b border-slate-800 bg-[#0b1a2c] px-5 py-1.5 text-[11px] text-slate-300 md:px-9">
        <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />{t("Backend")}: <strong className="text-emerald-300">{t("En ligne")}</strong></span>
        <span className="text-slate-600">·</span>
        <span>{t("Session")}: <strong className="font-mono text-slate-100">{formatHMS(sessionSeconds)}</strong></span>
        <span className="text-slate-600">·</span>
        <span className="hidden sm:inline">{t("Adresse")}: <strong className="break-all text-slate-200">{user.email}</strong></span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2 py-0.5 font-bold tracking-wider text-blue-200">{t("SUPER-ADMIN")}</span>
      </div>
      <header className="flex min-h-16 items-center gap-4 border-b border-slate-200 bg-white px-5 py-3 md:px-9">
        <div className="text-sm text-slate-400">{t("Administration")} <span className="mx-2">/</span> <strong className="text-slate-700">{sectionTitle[activeSection]}</strong></div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => searchRef.current?.focus()} title={t("Rechercher")} aria-label={t("Rechercher")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Search size={18} /></button>
          <div className="relative">
            <button onClick={() => setNotificationsOpen(v => !v)} title={t("Notifications")} aria-label={t("Notifications")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
              <Bell size={18} />
              {notificationEvents.length > 0 && <span className="absolute right-1 top-1 inline-flex h-2 w-2 rounded-full bg-amber-500" />}
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between">
                  <strong className="text-xs uppercase tracking-wider text-slate-500">{t("Notifications admin")}</strong>
                  <button onClick={() => setNotificationsOpen(false)} aria-label={t("Fermer")} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
                </div>
                {notificationEvents.length === 0 ? <p className="text-xs text-slate-400">{t("Aucune nouvelle notification")}</p> : <ul className="space-y-2">{notificationEvents.map((ev: any) => <li key={ev.id} className="rounded-lg bg-slate-50 p-2 text-[11px]"><div className="flex justify-between gap-2"><strong className="text-slate-700">{ev.eventType}</strong><small className="text-slate-400">{ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString("fr-FR") : "—"}</small></div><p className="mt-0.5 text-slate-500">{t("Par")} {ev.actorEmail}</p></li>)}</ul>}
              </div>
            )}
          </div>
          <div className="hidden items-center gap-2 border-l border-slate-200 pl-4 sm:flex">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">MA</span>
            <span><strong className="block text-xs">{user.name || t("SUPER-ADMIN")}</strong><small className="break-all text-[10px] text-slate-400">{user.email}</small></span>
            <ChevronDown size={14} className="text-slate-400" />
          </div>
          <button onClick={() => void logout()} disabled={logoutBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:hidden"><LogOut size={14} /> {t("Sortir")}</button>
        </div>
      </header>
      <div className="flex gap-2 overflow-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">{mobileNav.map(([id, label]) => <button key={id} onClick={() => { setActiveSection(id); if (id === "reports") setShowReports(true); }} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${activeSection === id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{label}</button>)}</div>
      <div className="mx-auto max-w-[1500px] p-5 md:p-9">
        {authorizationCodeNotice && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <div>
              <strong className="block text-sm">{t("Codes à transmettre de façon sécurisée à")} {authorizationCodeNotice.email}</strong>
              {authorizationCodeNotice.dailyTotpCode && (<><span className="mt-2 block text-xs font-bold text-blue-800">{t("Code TOTP quotidien LABBENCH")} · {authorizationCodeNotice.dailyTotpCodeDate} · {t("valable jusqu'à")} {authorizationCodeNotice.dailyTotpValidUntilUtc}</span><code className="mt-1 inline-block rounded-lg bg-white px-4 py-2 text-lg font-bold tracking-[.18em] text-blue-900">{authorizationCodeNotice.dailyTotpCode}</code></>)}
              {authorizationCodeNotice.localEnrollmentCode && (<><span className="mt-2 block text-xs font-bold text-emerald-800">{t("Invitation de connexion locale · à usage unique · phrase de passe + application TOTP")}</span><code className="mt-1 inline-block rounded-lg bg-white px-4 py-2 text-lg font-bold tracking-[.12em] text-emerald-900">{authorizationCodeNotice.localEnrollmentCode}</code></>)}
              {authorizationCodeNotice.code && (<><span className="mt-2 block text-xs text-amber-800">{t("Code de rapport · ne sert pas à se connecter")}</span><code className="mt-1 inline-block rounded-lg bg-white px-4 py-2 text-lg font-bold tracking-[.18em] text-amber-900">{authorizationCodeNotice.code}</code></>)}
              <small className="mt-2 block text-xs text-amber-800">{t("Ces secrets ne seront plus visibles après fermeture de cet avis. Ne les envoyez pas par canal public.")}</small>
            </div>
            <button onClick={() => setAuthorizationCodeNotice(null)} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800">{t("Codes transmis / copiés")}</button>
          </div>
        )}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-blue-600">{t("Centre de gouvernance AeroMind")}</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t("Une administration claire.")}<br /><span className="text-blue-600">{t("Un contrôle total.")}</span></h1>
            <p className="mt-3 max-w-xl text-sm text-slate-500">{t("Session active. Chaque décision ci-dessous est envoyée au backend et journalisée.")}</p>
            <p className="mt-2 text-[11px] text-slate-400"><kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px]">F5</kbd> {t("Rafraîchir")} · <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px]">/</kbd> {t("Rechercher")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void issueLocalInvite()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100"><ShieldCheck size={16} /> {t("Préparer mon accès local MFA")}</button>
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"><Plus size={17} /> {t("Créer un compte")}</button>
          </div>
        </div>

        <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={t("Comptes actifs")} value={totals.actifs ?? 0} icon={<Users size={18} />} tone="blue" t={t} />
          <Metric label={t("Projets en cours")} value={activity.data?.projects?.length ?? 0} icon={<FolderKanban size={18} />} tone="violet" t={t} />
          <Metric label={t("Rapports à approuver")} value={(reports.data || []).filter((report: any) => ["submitted", "reviewed_by_supervisor"].includes(report.status)).length} icon={<ClipboardCheck size={18} />} tone="amber" t={t} />
          <Metric label={t("Sous évaluation")} value={totals.en_attente ?? 0} icon={<Activity size={18} />} tone="green" t={t} />
          <Metric label={t("Espaces isolés")} value={totals.proprietaires_projets ?? 0} icon={<ShieldCheck size={18} />} tone="violet" t={t} />
        </div>

        {activeSection === "overview" && (
          <div className="mb-7 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-2xl font-bold text-slate-800">{accounts.data?.length || 0}</div><div className="text-xs text-slate-500">{t("Comptes totaux")}</div></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="text-2xl font-bold text-amber-700">{pendingRegs.length}</div><div className="text-xs text-slate-500">{t("En attente")}</div></div>
            <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-2xl font-bold text-slate-800">{adminEvents.length}</div><div className="text-xs text-slate-500">{t("Événements récents")}</div></div>
            <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-2xl font-bold text-slate-800">{reports.data?.length || 0}</div><div className="text-xs text-slate-500">{t("Rapports")}</div></div>
          </div>
        )}

        {/* System health widget — conveys a real operations console, not a game */}
        {activeSection === "overview" && (
          <div className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{t("État du système")}</p><h2 className="mt-1 font-bold">{t("Santé opérationnelle")}</h2></div>
              <Activity className="text-emerald-500" size={21} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs"><span className="block text-slate-500">{t("Backend")}</span><strong className="mt-1 flex items-center gap-2 text-emerald-700"><span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" />{t("En ligne")}</strong></div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"><span className="block text-slate-500">{t("Base de données")}</span><strong className="mt-1 block text-slate-700">{databaseType}</strong></div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs"><span className="block text-slate-500">{t("Émetteur SITL")}</span><strong className="mt-1 block text-blue-700">{t("Disponible")}</strong></div>
            </div>
          </div>
        )}

        {activeSection === "overview" && <section className="mb-7 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-[#10243a] to-[#174b70] p-5 text-white shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-200">{t("Posture de gouvernance")}</p><h2 className="mt-2 text-xl font-bold">{t("Un espace par identité.")}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">{t("Les projets et données métier sont maintenant rattachés à l'identifiant stable du compte créé par le Super-Admin. Un changement de méthode de connexion ne change pas de propriétaire.")}</p></div><ShieldCheck className="shrink-0 text-cyan-300" size={27} /></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl border border-white/10 bg-white/10 p-3"><span className="block text-blue-200">{t("Comptes actifs")}</span><strong className="mt-1 block text-lg">{totals.actifs ?? 0}</strong></div><div className="rounded-xl border border-white/10 bg-white/10 p-3"><span className="block text-blue-200">{t("Propriétaires de projets")}</span><strong className="mt-1 block text-lg">{totals.proprietaires_projets ?? 0}</strong></div></div></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-600">{t("Contrôles rapides")}</p><h2 className="mt-2 font-bold">{t("Centre de contrôle")}</h2></div><Activity className="text-emerald-500" size={21} /></div><div className="mt-4 space-y-3 text-xs"><div className="flex items-center justify-between"><span className="text-slate-500">{t("Isolation des projets")}</span><Pill tone="green">{t("ACTIVE")}</Pill></div><div className="flex items-center justify-between"><span className="text-slate-500">{t("Journal d'audit")}</span><Pill tone="green">{t("APPEND-ONLY")}</Pill></div><div className="flex items-center justify-between"><span className="text-slate-500">{t("Code LABBENCH 01")}</span><Pill tone="blue">{t("SUPER-ADMIN")}</Pill></div></div></div>
        </section>}
        {activeSection === "overview" && <div className="mb-7"><OperationModeCard /></div>}

        <SectionPanel section={activeSection} totals={totals} activity={activity.data} reports={reports.data} reportsLoading={reports.isLoading} onCreate={() => setShowCreate(true)} onReports={() => { setShowReports(true); setActiveSection("reports"); }} onApprove={(id) => approve.mutate({ id })} onProjectAction={(id, action) => { if (action === "save") saveProject.mutate({ id }); else if (action === "observe") observeProject.mutate({ id }); else if (window.confirm(t("Supprimer définitivement ce projet et ses données associées ?"))) deleteProject.mutate({ id }); }} invalidate={async () => { await invalidate(); }} t={t} />

        {/* Accounts section — denser, sortable, Excel-like with sticky header */}
        <div className={`grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] ${activeSection !== "accounts" ? "hidden" : ""}`}>
          <section id="accounts" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div><h2 className="font-bold">{t("Comptes & autorisations")}</h2><p className="mt-1 text-xs text-slate-400">{t("Les actions sont exécutées avec votre session Super-Admin.")}</p></div>
              <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Rechercher…")} aria-label={t("Rechercher")} className="w-44 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500" /></div>
            </div>
            <div className="flex gap-2 overflow-auto border-b border-slate-100 px-5 py-3">{filterOptions.map(x => <button key={x} onClick={() => setFilter(x)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${filter === x ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{x}</button>)}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="cursor-pointer px-5 py-3 font-semibold hover:text-slate-700" onClick={() => toggleSort("name")}>{t("Compte")} {sortBy === "name" && (sortDir === "asc" ? "▲" : "▼")}</th>
                    <th className="cursor-pointer font-semibold hover:text-slate-700" onClick={() => toggleSort("role")}>{t("Rôle")} {sortBy === "role" && (sortDir === "asc" ? "▲" : "▼")}</th>
                    <th>{t("Grade / niveau")}</th>
                    <th className="cursor-pointer font-semibold hover:text-slate-700" onClick={() => toggleSort("status")}>{t("Statut")} {sortBy === "status" && (sortDir === "asc" ? "▲" : "▼")}</th>
                    <th className="pr-5 text-right">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.isLoading ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">{t("Chargement des comptes…")}</td></tr>
                    : rows.map((a: any, idx: number) => {
                      const isSuperAdmin = a.role === "super_admin";
                      return <tr key={a.id} className={`border-t border-slate-100 hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                        <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{(a.name || a.email).slice(0, 2).toUpperCase()}</span><span><strong className="block text-xs">{a.name || t("Sans nom")}</strong><small className="text-[11px] text-slate-400">{a.email}</small></span></div></td>
                        <td><Pill tone={isSuperAdmin ? "blue" : a.role === "surveillant" ? "violet" : a.role === "demo" ? "amber" : a.role === "visitor" ? "slate" : "blue"}>{roleLabel[a.role] || a.role}</Pill></td>
                        <td><span className="font-semibold text-slate-700">{a.level || "L1"}</span><small className="ml-1 text-[11px] text-slate-400">{a.level === "L4" ? t("Expert") : a.level === "L3" ? t("Avancé") : a.level === "L2" ? t("Ingénieur") : t("Découverte")}</small></td>
                        <td><Pill tone={a.accountStatus === "active" ? "green" : a.accountStatus === "evaluation" ? "amber" : "red"}>{statusLabel[a.accountStatus] || a.accountStatus}</Pill></td>
                        <td className="pr-5">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <select aria-label={t(`Rôle de ${a.email}`)} value={a.role} disabled={isSuperAdmin} title={isSuperAdmin ? t("Le rôle Super-Admin ne peut pas être modifié") : undefined} onChange={e => update.mutate({ id: a.id, role: e.target.value as Role })} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:bg-slate-100 disabled:text-slate-400">
                              <option value="user">{t("Utilisateur")}</option>
                              <option value="demo">{t("Démo")}</option>
                              <option value="visitor">{t("Visiteur")}</option>
                              <option value="surveillant">{t("Surveillant")}</option>
                              <option value="admin">{t("ADMIN")}</option>
                              {isSuperAdmin && <option value="super_admin">{t("SUPER-ADMIN")}</option>}
                            </select>
                            {isSuperAdmin ? (
                              <>
                                <button onClick={() => setEditSuperAdmin({ id: a.id, name: a.name || "", email: a.email })} className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"><Edit size={12} /> {t("Modifier")}</button>
                                <button onClick={() => updateSuperAdmin.mutate({ id: a.id, accountStatus: "active" })} disabled={updateSuperAdmin.isPending} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"><Save size={12} /> {t("Sauvegarder")}</button>
                                <button onClick={() => { if (window.confirm(t("Placer le Super-Admin en alerte de mise en conformité ?"))) deleteSuperAdmin.mutate({ id: a.id, permanent: false }); }} className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"><AlertTriangle size={12} /> {t("Supprimer")}</button>
                                <button onClick={() => { if (window.confirm(t("Suppression DÉFINITIVE du Super-Admin. Cette action est irréversible."))) deleteSuperAdmin.mutate({ id: a.id, permanent: true }); }} className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"><Trash2 size={12} /> {t("Supprimer définitivement")}</button>
                                <button onClick={() => resetSuperAdminLocal.mutate({ id: a.id })} disabled={resetSuperAdminLocal.isPending} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-50"><KeyRound size={12} /> {t("Réinit. MFA")}</button>
                                <button onClick={() => rotateSuperAdminCode.mutate({ id: a.id })} disabled={rotateSuperAdminCode.isPending} className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50"><ShieldCheck size={12} /> {t("Code rapport")}</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => update.mutate({ id: a.id, accountStatus: a.accountStatus === "evaluation" ? "active" : "evaluation" })} className="rounded-md border border-amber-200 px-2 py-1 text-[11px] text-amber-700">{a.accountStatus === "evaluation" ? t("Activer") : t("Évaluer")}</button>
                                <button onClick={() => { if (window.confirm(t(`Révoquer l'accès local MFA de ${a.email} et générer une nouvelle invitation à usage unique ?`))) resetLocal.mutate({ id: a.id }); }} className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] text-emerald-800">{t("Réinit. MFA")}</button>
                                <button onClick={() => { if (window.confirm(t(`Attribuer un nouveau code TOTP quotidien à ${a.email} ? L'ancien code du jour sera révoqué.`))) issueDailyCode.mutate({ id: a.id }); }} className="rounded-md border border-cyan-200 px-2 py-1 text-[11px] text-cyan-700">{t("TOTP du jour")}</button>
                                <button onClick={() => rotateCode.mutate({ id: a.id })} className="rounded-md border border-blue-200 px-2 py-1 text-[11px] text-blue-700">{t("Code rapport")}</button>
                                <button onClick={() => { const permanent = a.accountStatus === "cancelled"; const question = permanent ? t(`Supprimer définitivement ${a.email} ? Cette action conserve uniquement la trace d'audit.`) : t(`Placer ${a.email} en alerte et mise en conformité ?`); if (window.confirm(question)) remove.mutate({ id: a.id, permanent }); }} className="rounded-md border border-red-200 px-2 py-1.5 text-[11px] text-red-600" aria-label={a.accountStatus === "cancelled" ? t("Suppression définitive") : t("Placer en alerte")}>{a.accountStatus === "cancelled" ? t("Supprimer définitivement") : <Trash2 size={13} />}</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>;
                    })}
                </tbody>
              </table>
            </div>
            {/* Console log panel — last 5 admin actions */}
            <div className="border-t border-slate-200 bg-[#0b1a2c] p-4 text-slate-200">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-blue-300"><Activity size={12} /> {t("Journal console · 5 derniers événements")}</div>
              {recentAdminEvents.length === 0 ? <p className="font-mono text-[11px] text-slate-400">{t("Aucun événement récent.")}</p> : <ul className="space-y-1 font-mono text-[11px]">{recentAdminEvents.map((ev: any) => <li key={ev.id} className="flex flex-wrap items-center gap-3"><span className="text-emerald-400">$</span><span className="text-blue-200">{ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString("fr-FR") : "—"}</span><span className="text-slate-100">{ev.eventType}</span><span className="text-slate-400">{t("Par")} {ev.actorEmail}</span></li>)}</ul>}
            </div>
          </section>

          <div className="space-y-6">
            <section id="reports" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div><h2 className="font-bold">{t("Rapports à approuver")}</h2><p className="mt-1 text-[11px] text-slate-400">{t("Validation finale par le Super-Admin.")}</p></div>
                <button onClick={() => { setShowReports(v => !v); void reports.refetch(); }} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{showReports ? t("Masquer") : t("Charger")}</button>
              </div>
              {showReports && <div className="space-y-3">{reports.isLoading ? <p className="text-xs text-slate-400">{t("Chargement…")}</p> : (reports.data || []).filter((r: any) => ["submitted", "reviewed_by_supervisor"].includes(r.status)).map((r: any) => <div key={r.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-start justify-between"><div><p className="text-xs font-bold">{t("Rapport")} {String(r.id).slice(0, 8)}</p><p className="mt-1 text-[11px] text-slate-400">{t("Statut")} : {r.status}</p></div><FileText size={16} className="text-blue-500" /></div>{r.status === "reviewed_by_supervisor" && <button onClick={() => approve.mutate({ id: r.id })} className="mt-3 w-full rounded-lg border border-blue-200 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">{t("Approuver définitivement")}</button>}</div>)}{!(reports.data || []).some((r: any) => ["submitted", "reviewed_by_supervisor"].includes(r.status)) && <p className="text-xs text-slate-400">{t("Aucun rapport en attente.")}</p>}</div>}
              <p className="text-[11px] leading-5 text-slate-400">{t("Le surveillant contrôle d'abord le rapport ; le Super-Admin réalise ensuite l'approbation finale.")}</p>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold">{t("Limites & niveaux")}</h2>
              <div className="mt-4 space-y-3 text-xs">
                <Info label={t("Démo")} value={t("Quotas configurables · 1 projet")} t={t} />
                <Info label={t("Visiteur")} value={t("Consultation limitée · aucun projet persistant")} t={t} />
                <Info label={t("Utilisateur")} value={t("Projets et rapports sous contrôle")} t={t} />
                <Info label={t("Niveau")} value={t("Attribué selon le grade")} t={t} />
              </div>
            </section>
          </div>
        </div>
        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-slate-400">{t("AeroMind · session active · toutes les actions sont journalisées")}</p>
      </div>
    </section>
  </div>
  {showCreate && (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <form onSubmit={e => { e.preventDefault(); create.mutate({ email, name, role, level }); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">{t("Nouveau compte")}</p><h2 className="mt-1 text-xl font-bold">{t("Créer un accès AeroMind")}</h2></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mb-4 block text-xs font-semibold text-slate-600">{t("Nom complet")}<input required value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" /></label>
        <label className="mb-4 block text-xs font-semibold text-slate-600">{t("Adresse e-mail")}<input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-600">{t("Rôle")}<select value={role} onChange={e => setRole(e.target.value as Role)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm"><option value="user">{t("Utilisateur")}</option><option value="demo">{t("Démo")}</option><option value="visitor">{t("Visiteur")}</option><option value="surveillant">{t("Surveillant")}</option><option value="admin">{t("ADMIN")}</option></select></label>
          <label className="text-xs font-semibold text-slate-600">{t("Niveau")}<select value={level} onChange={e => setLevel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm"><option value="L1">L1 · {t("Découverte")}</option><option value="L2">L2 · {t("Ingénieur")}</option><option value="L3">L3 · {t("Avancé")}</option><option value="L4">L4 · {t("Expert")}</option></select></label>
        </div>
        <p className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-800">{t("Cette action autorise l'adresse dans AeroMind. L'utilisateur peut soit se connecter via Entra, soit activer un accès local avec l'invitation à usage unique affichée après création, un mot de passe robuste et une application TOTP.")}</p>
        <button disabled={create.isPending} className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{create.isPending ? t("Création…") : t("Créer le compte")}</button>
      </form>
    </div>
  )}
  {editSuperAdmin && (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={() => setEditSuperAdmin(null)}>
      <form onSubmit={e => { e.preventDefault(); updateSuperAdmin.mutate({ id: editSuperAdmin.id, name: editSuperAdmin.name, email: editSuperAdmin.email }); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">{t("SUPER-ADMIN")}</p><h2 className="mt-1 text-xl font-bold">{t("Modifier le Super-Admin")}</h2></div><button type="button" onClick={() => setEditSuperAdmin(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <label className="mb-4 block text-xs font-semibold text-slate-600">{t("Nom complet")}<input required value={editSuperAdmin.name} onChange={e => setEditSuperAdmin(v => v ? { ...v, name: e.target.value } : v)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" /></label>
        <label className="mb-4 block text-xs font-semibold text-slate-600">{t("Adresse e-mail")}<input required type="email" value={editSuperAdmin.email} onChange={e => setEditSuperAdmin(v => v ? { ...v, email: e.target.value } : v)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" /></label>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">{t("Le rôle reste SUPER-ADMIN. La modification est journalisée et appliquée immédiatement.")}</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => setEditSuperAdmin(null)} className="flex-1 rounded-lg border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">{t("Annuler")}</button>
          <button type="submit" disabled={updateSuperAdmin.isPending} className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{updateSuperAdmin.isPending ? t("Enregistrement…") : t("Enregistrer")}</button>
        </div>
      </form>
    </div>
  )}
  </main>;
}

function AuthShell({ children }: { children: React.ReactNode }) { return <main className="grid min-h-screen place-items-center bg-[#f5f7fa] p-5 text-[#10243a]"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl"><Link href="/" className="mb-8 flex items-center gap-3"><span className="grid h-9 w-9 skew-x-[-8deg] place-items-center border border-blue-600 text-2xl italic text-blue-600">A</span><strong className="tracking-[.18em]">AEROMIND</strong></Link>{children}</div></main>; }

function SectionPanel({ section, totals, activity, reports, reportsLoading, onCreate, onReports, onApprove, onProjectAction, invalidate, t }: { section: Section; totals: any; activity: any; reports?: any[]; reportsLoading: boolean; onCreate: () => void; onReports: () => void; onApprove: (id: string) => void; onProjectAction: (id: string, action: "save" | "observe" | "delete") => void; invalidate: () => Promise<void>; t: (text: string) => string }) {
  if (section === "accounts") return null;
  if (section === "approvals") return null;
  if (section === "overview") return <section className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-blue-600">{t("Vue d'ensemble active")}</p><h2 className="mt-2 text-2xl font-bold">{t("Bienvenue dans la gouvernance AeroMind")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("Utilisez le menu de gauche pour ouvrir chaque espace. Les compteurs sont lus depuis le backend, tandis que les décisions sont journalisées.")}</p><div className="mt-5 flex flex-wrap gap-3"><button onClick={onCreate} className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white">{t("Créer un compte")}</button><button onClick={onReports} className="rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-xs font-bold text-blue-700">{t("Ouvrir les rapports")}</button></div></section>;
  if (section === "projects") return <WorkspaceCard title={t("Projets")} subtitle={t("Vue globale des projets AeroMind persistés. Chaque action est contrôlée et journalisée.")} t={t}><div className="space-y-3">{(activity?.projects || []).length ? (activity.projects as any[]).map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><strong className="block text-sm">{p.name || t("Projet sans nom")}</strong><small className="text-xs text-slate-400">{t("Propriétaire")} : {p.userId} · {t("créé")} {p.createdAt ? new Date(p.createdAt).toLocaleDateString("fr-FR") : "—"}</small></div><div className="flex flex-wrap items-center gap-2"><Pill tone={p.controlStatus === "observed" ? "amber" : p.controlStatus === "saved" ? "blue" : "green"}>{p.controlStatus === "observed" ? t("Observation") : p.controlStatus === "saved" ? t("Sauvegardé") : t("Actif")}</Pill><button onClick={() => onProjectAction(String(p.id), "save")} className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1.5 text-[11px] font-semibold text-blue-700"><Save size={13} /> {t("Sauvegarder")}</button><button onClick={() => onProjectAction(String(p.id), "observe")} className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1.5 text-[11px] font-semibold text-amber-700"><Eye size={13} /> {t("Observer")}</button><button onClick={() => onProjectAction(String(p.id), "delete")} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-[11px] font-semibold text-red-600"><Trash2 size={13} /> {t("Supprimer")}</button></div></div>) : <Empty title={t("Aucun projet persistant")} text={t("Les projets créés par les utilisateurs apparaîtront ici.")} />}</div></WorkspaceCard>;
  if (section === "reports") return <WorkspaceCard title={t("Rapports à valider")} subtitle={t("Les rapports suivent le circuit surveillant puis approbation Super-Admin.")} t={t}><div className="space-y-3">{reportsLoading ? <p className="text-sm text-slate-400">{t("Chargement des rapports…")}</p> : (reports || []).filter((r: any) => ["submitted", "reviewed_by_supervisor"].includes(r.status)).map((r: any) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><strong className="block text-sm">{t("Rapport")} {String(r.id).slice(0, 8)}</strong><span className="text-xs text-slate-500">{t("Statut")} : {r.status}</span></div>{r.status === "reviewed_by_supervisor" ? <button onClick={() => onApprove(String(r.id))} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">{t("Approuver définitivement")}</button> : <Pill tone="amber">{t("En attente du surveillant")}</Pill>}</div>)}{!reportsLoading && !(reports || []).some((r: any) => ["submitted", "reviewed_by_supervisor"].includes(r.status)) && <Empty title={t("Aucun rapport en attente")} text={t("Les rapports soumis apparaîtront ici après contrôle.")} />}</div></WorkspaceCard>;
  if (section === "levels") return <WorkspaceCard title={t("Niveaux & quotas")} subtitle={t("Les niveaux sont attribués selon le grade et appliqués par le backend.")} t={t}><div className="grid gap-3 md:grid-cols-2">{([["L1", t("Découverte"), t("Accès de base")], ["L2", t("Ingénieur"), t("Projets et simulations")], ["L3", t("Avancé"), t("Workflows avancés")], ["L4", t("Expert"), t("Gouvernance et validation")]] as [string, string, string][]).map(([id, label, text]) => <div key={id} className="rounded-xl border border-slate-200 p-4"><Pill tone="blue">{id}</Pill><strong className="mt-3 block text-sm">{label}</strong><p className="mt-1 text-xs text-slate-400">{text}</p></div>)}</div></WorkspaceCard>;
  if (section === "audit") return <WorkspaceCard title={t("Journal d'audit")} subtitle={t("Historique des créations, promotions, évaluations et suppressions.")} t={t}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 text-red-600" size={18} />
        <div>
          <strong className="block text-xs font-bold text-red-800">{t("Vider le journal d'audit global")}</strong>
          <p className="mt-1 text-[11px] text-red-700">{t("Supprime définitivement toutes les entrées des tables admin_account_events, audit_events_ext et audit_events. Cette action est journalisée (un événement audit_log.cleared survit à la purge).")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t("Portée de purge")} id="audit-clear-scope" defaultValue="all" className="rounded-md border border-red-300 bg-white px-2 py-1.5 text-[11px] text-red-800">
          <option value="all">{t("Toutes les tables")}</option>
          <option value="admin_account_events">{t("Événements admin")}</option>
          <option value="audit_events_ext">{t("Audit canonique (hash-chainé)")}</option>
          <option value="audit_events">{t("Audit legacy projets")}</option>
        </select>
        <button onClick={async () => {
          const scope = (document.getElementById("audit-clear-scope") as HTMLSelectElement)?.value || "all";
          if (!window.confirm(t("Vider le journal d'audit (portée : ") + scope + t(") ? Cette action est irréversible."))) return;
          try {
            const r = await fetch("/api/trpc/superAdmin.clearAuditLog", {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json", ...bearerHeaders() },
              body: JSON.stringify({ json: { scope } }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error?.message || "Purge failed");
            const result = data.result?.data?.json ?? data;
            const counts = result.cleared || result.counts || {};
            const total = Object.values(counts).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
            const failures = result.failures || {};
            const failureKeys = Object.keys(failures);
            toast.success(t("Journal d'audit vidé"), { description: String(total) + t(" entrée(s) supprimée(s)") + (failureKeys.length ? ` · ${failureKeys.length} ${t("table(s) non purgeable(s) en prod PG (trigger append-only)")}` : "") });
            await invalidate();
          } catch (e: any) {
            toast.error(t("Vidage du journal échoué"), { description: e.message });
          }
        }} className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-700">
          <Trash2 size={13} /> {t("Vider le journal")}
        </button>
        <Link href="/audit-journal" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
          <Activity size={13} /> {t("Mon journal personnel")}
        </Link>
      </div>
    </div>
    <div className="space-y-3">{(activity?.adminEvents || []).length ? (activity.adminEvents as any[]).map(event => <div key={event.id} className="rounded-xl border border-slate-100 p-4"><div className="flex justify-between gap-3"><strong className="text-xs">{event.eventType}</strong><small className="text-[11px] text-slate-400">{event.createdAt ? new Date(event.createdAt).toLocaleString("fr-FR") : "—"}</small></div><p className="mt-1 text-xs text-slate-500">{t("Par")} {event.actorEmail}</p></div>) : <Empty title={t("Journal vide")} text={t("Les prochaines décisions seront enregistrées ici.")} />}</div>
  </WorkspaceCard>;
  return <WorkspaceCard title={t("Paramètres")} subtitle={t("État opérationnel de la console Super-Admin.")} t={t}><div className="grid gap-3 md:grid-cols-3"><Info label={t("Comptes actifs")} value={String(totals.actifs ?? 0)} t={t} /><Info label={t("Décisions journalisées")} value={String(totals.decisions ?? 0)} t={t} /><Info label={t("Session")} value={t("OIDC sécurisée")} t={t} /></div><p className="mt-5 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-500">{t("Les paramètres sensibles de déploiement et de fournisseur OIDC restent protégés côté serveur.")}</p></WorkspaceCard>;
}
function WorkspaceCard({ title, subtitle, children, t }: { title: string; subtitle: string; children: React.ReactNode; t: (text: string) => string }) { return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">{title}</h2><p className="mt-1 mb-5 text-sm text-slate-400">{subtitle}</p>{children}<p className="mt-4 text-[10px] text-slate-400">{t("Action journalisée · traçable côté serveur")}</p></section>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center"><strong className="block text-sm">{title}</strong><p className="mt-1 text-xs text-slate-400">{text}</p></div>; }

function Nav({ icon, label, active = false, onClick, badge }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; badge?: number }) { return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${active ? "bg-blue-500/15 font-semibold text-blue-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{icon}<span>{label}</span>{badge !== undefined && badge > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{badge}</span>}</button>; }
function Metric({ label, value, icon, tone, t }: { label: string; value: number; icon: React.ReactNode; tone: string; t: (text: string) => string }) { const colors: Record<string, string> = { blue: "bg-blue-50 text-blue-600", violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600" }; return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone] || colors.blue}`}>{icon}</span><span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{t("En direct")}</span></div><strong className="mt-4 block text-2xl">{value}</strong><span className="text-xs text-slate-400">{label}</span></div>; }
function Info({ label, value, t }: { label: string; value: string; t: (text: string) => string }) { void t; return <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="font-semibold text-slate-600">{label}</span><span className="max-w-[175px] text-right text-slate-400">{value}</span></div>; }

function LocalAuthPanel({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"login" | "enroll" | "setup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const post = async (path: string, body: object) => {
    const response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || t("Opération refusée."));
    return result;
  };
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await operation(); } catch (error: any) { setMessage(error.message || t("Échec de l'opération.")); } finally { setBusy(false); }
  };
  const loginLocal = () => run(async () => { await post("/api/auth/local/login", { email, password, otp }); await onAuthenticated(); });
  const enrollLocal = () => run(async () => { const result = await post("/api/auth/local/enroll", { email, enrollment_code: code, password }); setSecret(result.secret); setOtp(""); setMode("setup"); });
  const confirm = () => run(async () => { await post("/api/auth/local/enroll/confirm", { email, otp }); await onAuthenticated(); });
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="mb-3 flex gap-2"><button type="button" onClick={() => { setMode("login"); setMessage(""); }} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${mode === "login" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>{t("Connexion locale")}</button><button type="button" onClick={() => { setMode("enroll"); setMessage(""); }} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${mode !== "login" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>{t("Activer un compte")}</button></div>
    {mode === "setup" ? <div><h2 className="text-sm font-bold text-slate-800">{t("Configurer l'application TOTP")}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{t("Ajoutez cette clé à une application d'authentification. La clé ne sera plus affichée après cette étape.")}</p><code className="mt-3 block break-all rounded-lg bg-white p-3 text-xs font-bold tracking-wider text-slate-800">{secret}</code><button type="button" onClick={() => navigator.clipboard?.writeText(secret)} className="mt-2 text-xs font-bold text-blue-700">{t("Copier la clé")}</button><label className="mt-3 block text-xs font-semibold text-slate-600">{t("Code à 6 chiffres")}<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm tracking-[.35em]" /></label><button disabled={busy || otp.length !== 6} onClick={() => void confirm()} className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? t("Vérification…") : t("Valider le MFA et activer")}</button></div> : <div className="space-y-3"><label className="block text-xs font-semibold text-slate-600">{t("Adresse e-mail")}<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm" /></label><label className="block text-xs font-semibold text-slate-600">{t("Phrase de passe")}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm" />{mode === "enroll" && <small className="mt-1 block font-normal text-slate-500">{t("14 caractères minimum. Utilisez une phrase longue et unique.")}</small>}</label>{mode === "login" ? <><label className="block text-xs font-semibold text-slate-600">{t("Code TOTP")}<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm tracking-[.35em]" /></label><button disabled={busy || otp.length !== 6} onClick={() => void loginLocal()} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? t("Connexion…") : t("Se connecter avec MFA")}</button></> : <><label className="block text-xs font-semibold text-slate-600">{t("Invitation à usage unique fournie par le Super-Admin")}<input autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm" /></label><button disabled={busy || password.length < 14 || code.length < 12} onClick={() => void enrollLocal()} className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? t("Préparation…") : t("Créer mon accès local")}</button></>}</div>}
    {message && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">{message}</p>}
    <p className="mt-3 text-[10px] leading-4 text-slate-500">{t("L'accès local est réservé aux comptes préprovisionnés. Double facteur obligatoire ; compte verrouillé automatiquement après plusieurs échecs.")}</p>
  </section>;
}
