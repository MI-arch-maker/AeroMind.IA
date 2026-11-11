import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Activity, AlertTriangle, Bell, ClipboardCheck, Edit, ExternalLink, FileText, FolderKanban, KeyRound, LayoutDashboard, LogIn, LogOut, Moon, Plus, RefreshCw, Save, Search, Settings, ShieldCheck, SlidersHorizontal, Trash2, Users, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { bearerHeaders, clearSessionToken } from "@/lib/sessionToken";
import { startLogin } from "@/const";
import { OperationModeCard } from "@/components/OperationModeCard";
import { OperationalCapabilitiesPanel } from "@/components/OperationalCapabilitiesPanel";
import { SystemHealthPanel } from "@/components/SystemHealthPanel";
import { AuditEventExplorer } from "@/components/AuditEventExplorer";
import { GovernanceCycleMap } from "@/components/GovernanceCycleMap";
import { GovernanceCapabilityMatrix } from "@/components/GovernanceCapabilityMatrix";
import { useLanguage } from "../contexts/LanguageContext";
import "./super-admin.css";

type Role = "user" | "demo" | "visitor" | "surveillant" | "admin";
type AuthUser = { email: string; name?: string; role?: string; level?: string; account_status?: string };
type Section = "overview" | "operations" | "accounts" | "approvals" | "projects" | "reports" | "levels" | "audit" | "settings";
type SortKey = "email" | "role" | "status" | "name";
type SortDir = "asc" | "desc";

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", amber: "bg-amber-50 text-amber-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", slate: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone] || tones.slate}`}>{children}</span>;
}

export default function SuperAdmin() {
  const { t } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [sleeping, setSleeping] = useState(false);
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
  const [pendingError, setPendingError] = useState("");
  const [editSuperAdmin, setEditSuperAdmin] = useState<{ id: string; name: string; email: string } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("email");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [refreshingAll, setRefreshingAll] = useState(false);
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
      const authenticatedUser = response.ok ? (await response.json() as AuthUser) : null;
      setUser(authenticatedUser);
      if (authenticatedUser) setSleeping(false);
    } catch { setUser(null); } finally { setAuthLoading(false); }
  };
  useEffect(() => {
    void refreshSession();
    const handler = () => void refreshSession();
    window.addEventListener("aeromind-auth-changed", handler);
    return () => window.removeEventListener("aeromind-auth-changed", handler);
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
  const refreshConsole = async () => {
    setRefreshingAll(true);
    try { await Promise.all([invalidate(), fetchPending()]); toast.success(t("Registres actualisés")); }
    catch { toast.error(t("Actualisation incomplète")); }
    finally { setRefreshingAll(false); }
  };

  const fetchPending = async () => {
    setPendingLoading(true);
    setPendingError("");
    try {
      const response = await fetch("/api/auth/local/admin/pending-registrations", {
        credentials: "include", headers: bearerHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || t("Chargement des demandes refusé."));
      setPendingRegs(data.pending || []);
    } catch (error: any) { setPendingError(error.message || t("Registre d'approbation indisponible.")); }
    finally { setPendingLoading(false); }
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
      setAuthorizationCodeNotice({ email, localEnrollmentCode: result.enrollment_code });
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
      const response = await fetch("/api/auth/oidc/logout", { method: "POST", credentials: "include", headers: bearerHeaders() });
      if (!response.ok) throw new Error(t("Le serveur n’a pas confirmé la révocation de la session."));
      clearSessionToken();
      setUser(null);
      await utils.reset();
      // P-LOGOUT-2 fix: dispatch the auth-changed event so other mounted
      // tabs/components (e.g. an open Home tab) refresh their session state.
      window.dispatchEvent(new Event("aeromind-auth-changed"));
      toast.success(t("Session fermée"));
    } catch (error) {
      toast.error(t("Déconnexion impossible"), { description: error instanceof Error ? error.message : t("Échec de fermeture de la session.") });
    } finally { setLogoutBusy(false); }
  };
  const sleepConsole = async () => {
    setLogoutBusy(true);
    try {
      const response = await fetch("/api/auth/oidc/logout", { method: "POST", credentials: "include", headers: bearerHeaders() });
      if (!response.ok) throw new Error("Le serveur n’a pas confirmé la révocation de la session.");
      clearSessionToken();
      setUser(null);
      await utils.reset();
      window.dispatchEvent(new Event("aeromind-auth-changed"));
      setSleeping(true);
      toast.info(t("Console en veille sécurisée"), { description: t("La session a été révoquée. Une reconnexion explicite est requise pour reprendre.") });
    } catch (error) {
      toast.error(t("Mise en veille impossible"), { description: error instanceof Error ? error.message : "Échec de fermeture de la session." });
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
  const displayName = user?.name || user?.email || t("SUPER-ADMIN");

  if (authLoading) return <AuthShell><p className="text-sm text-slate-500">{t("Vérification de la session Super-Admin…")}</p></AuthShell>;
  if (!user) return <AuthShell><ShieldCheck className="mb-4 text-blue-600" size={38} /><h1 className="text-2xl font-bold">{t("Connexion console AeroMind")}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{t("Choisissez Microsoft Entra ou l'accès local sécurisé préalablement activé par le Super-Admin. Les comptes locaux exigent un mot de passe et un code d'application TOTP.")}</p><button onClick={() => startLogin()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><LogIn size={17} />{t("Continuer avec Microsoft Entra")}</button><div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t("OU ACCÈS LOCAL MFA")}<span className="h-px flex-1 bg-slate-200" /></div><LocalAuthPanel onAuthenticated={refreshSession} /><Link href="/" className="mt-5 block text-center text-xs font-semibold text-slate-500 hover:text-blue-600">{t("Retour au cockpit")}</Link></AuthShell>;
  if (denied) return <AuthShell><ShieldCheck className="mb-4 text-red-500" size={38} /><h1 className="text-2xl font-bold">{t("Accès refusé")}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{t("Cette session n'est pas le Super-Admin autorisé.")}</p><button onClick={() => void logout()} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700"><LogOut size={16} /> {t("Se déconnecter")}</button></AuthShell>;

  const totals = activity.data?.totals || {};
  const sectionTitle: Record<Section, string> = {
    overview: t("Vue d'ensemble"),
    operations: t("Centre d’opérations"),
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
    { id: "operations", label: t("Centre d’opérations"), icon: <Activity size={17} /> },
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
    ["operations", t("Opérations")],
    ["accounts", t("Comptes")],
    ["approvals", t("Approbations")],
    ["projects", t("Projets")],
    ["reports", t("Rapports")],
    ["levels", t("Niveaux")],
    ["audit", t("Audit")],
    ["settings", t("Paramètres")],
  ];

  const sectionPanelProps = {
    totals,
    activity: activity.data,
    reports: reports.data,
    reportsLoading: reports.isLoading,
    pendingRegs,
    pendingLoading,
    pendingError,
    onRefreshPending: () => void fetchPending(),
    onApproveRegistration: (address: string, requestedName: string) => void approveRegistration(address, requestedName),
    onRejectRegistration: (address: string) => void rejectRegistration(address),
    onCreate: () => setShowCreate(true),
    onReports: () => { setShowReports(true); setActiveSection("reports"); },
    onApprove: (id: string) => approve.mutate({ id }),
    onProjectAction: (id: string, action: "save" | "observe" | "delete") => {
      if (action === "save") saveProject.mutate({ id });
      else if (action === "observe") observeProject.mutate({ id });
      else if (window.confirm(t("Supprimer définitivement ce projet et ses données associées ?"))) deleteProject.mutate({ id });
    },
    invalidate: async () => { await invalidate(); },
    t,
  };

  return <main className="sa-shell text-[#10243a]">
    <header className="sa-global-header">
      <Link href="/" className="sa-global-brand"><span className="sa-mark">A</span><span><strong>{t("AEROMIND.IA")}</strong><small>{t("PLAN DE CONTRÔLE · SUPER-ADMIN")}</small></span></Link>
      <div className="sa-global-identity"><span className="sa-global-level">{t("L5 ·")} {t("SUPER-ADMIN")}</span><span>{t("Session vérifiée")}</span><span>{t("Aucune connexion automatique")}</span><span>{t("AUCUNE COMMANDE PHYSIQUE DEPUIS CE CENTRE")}</span></div>
      <div className="sa-global-actions">
        <button type="button" onClick={() => void refreshConsole()} disabled={refreshingAll} className="sa-global-action sa-global-refresh" title={refreshingAll ? t("Actualisation…") : t("Actualiser")} aria-label={refreshingAll ? t("Actualisation…") : t("Actualiser")}><RefreshCw size={15} className={refreshingAll ? "animate-spin" : ""} /><span>{refreshingAll ? t("Actualisation…") : t("Actualiser")}</span></button>
        <button type="button" onClick={() => void sleepConsole()} disabled={logoutBusy} className="sa-global-action is-standby" title={t("Mise en veille")} aria-label={t("Mise en veille")}><Moon size={15} /><span>{t("Mise en veille")}</span></button>
        <button type="button" onClick={() => void logout()} disabled={logoutBusy} className="sa-global-action is-logout" title={t("Déconnexion")} aria-label={t("Déconnexion")}><LogOut size={15} /><span>{t("Déconnexion")}</span></button>
        <button type="button" onClick={() => { if (activeSection !== "accounts") setActiveSection("accounts"); window.setTimeout(() => searchRef.current?.focus(), 0); }} title={t("Rechercher")} aria-label={t("Rechercher")} className="sa-global-icon-action"><Search size={17} /></button>
        <div className="sa-global-notifications">
          <button type="button" onClick={() => setNotificationsOpen(v => !v)} title={t("Notifications")} aria-label={t("Notifications")} aria-expanded={notificationsOpen} className="sa-global-icon-action">
            <Bell size={17} />{notificationEvents.length > 0 && <span className="sa-global-notification-dot" aria-hidden="true" />}
          </button>
          {notificationsOpen && <div className="sa-global-notification-menu" role="dialog" aria-label={t("Notifications admin")}>
            <div className="sa-global-notification-heading"><strong>{t("Notifications admin")}</strong><button type="button" onClick={() => setNotificationsOpen(false)} aria-label={t("Fermer")}><X size={14} /></button></div>
            {notificationEvents.length === 0 ? <p>{t("Aucune nouvelle notification")}</p> : <ul>{notificationEvents.map((ev: any) => <li key={ev.id}><div><strong>{ev.eventType}</strong><time>{ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString("fr-FR") : "—"}</time></div><small>{t("Par")} {ev.actorEmail}</small></li>)}</ul>}
          </div>}
        </div>
        <div className="sa-global-user"><span className="sa-global-dot" aria-hidden="true" /><span><strong>{displayName}</strong><small>{user.email}</small></span></div>
      </div>
    </header>
    <div className="sa-application-shell flex min-h-screen">
    <aside className="sa-sidebar hidden w-64 shrink-0 flex-col bg-[#10243a] px-5 py-6 text-white lg:flex">
      <div className="sa-sidebar-heading"><span>{t("NAVIGATION GOUVERNANCE")}</span><strong>{t("ESPACE L5")}</strong></div>
      <div className="my-5 h-px bg-white/10" />
      <nav className="space-y-1 text-sm">{navItems.map(item => <Nav key={item.id} active={activeSection === item.id} icon={item.icon} label={item.label} onClick={() => { setActiveSection(item.id); if (item.id === "reports") setShowReports(true); }} badge={item.badge} />)}</nav>
      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck size={15} className="text-blue-300" />
          {t("Session sécurisée")}
          <span className="ml-auto inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
        </div>
        <p className="mt-2 break-all leading-5 text-slate-400">{user.email}</p>
        <span className="mt-2 inline-flex rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-blue-200">{t("SUPER-ADMIN")}</span>
        <small className="sa-sidebar-session-note">{t("La session reste contrôlée côté serveur.")}</small>
      </div>
    </aside>
    <section className="min-w-0 flex-1">
      <div className="sa-mobile-nav flex gap-2 overflow-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">{mobileNav.map(([id, label]) => <button key={id} onClick={() => { setActiveSection(id); if (id === "reports") setShowReports(true); }} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${activeSection === id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{label}</button>)}</div>
      <div className="sa-content mx-auto max-w-[1500px] p-5 md:p-9">
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
        {(accounts.error || activity.error || reports.error) && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><span>{t("Certaines données de gouvernance n’ont pas pu être chargées. Les actions affectées restent indisponibles jusqu’au prochain chargement.")}</span><button type="button" onClick={() => void refreshConsole()} className="font-bold underline">{t("Réessayer")}</button></div>}
        {activeSection !== "overview" && <div className="sa-page-heading">
          <div>
            <p className="sa-page-kicker">{t("GOUVERNANCE · SESSION SUPER-ADMIN")}</p>
            <h1>{sectionTitle[activeSection]}</h1>
            <p>{t("Données et commandes restent soumises aux autorisations backend et à la trace d’audit.")}</p>
          </div>
          {activeSection === "accounts" && <div className="sa-page-actions">
            <button onClick={() => void issueLocalInvite()} className="sa-action-button sa-outline-action"><ShieldCheck size={15} /> {t("Préparer mon accès local MFA")}</button>
            <button onClick={() => setShowCreate(true)} className="sa-action-button sa-primary-action"><Plus size={16} /> {t("Créer un compte")}</button>
          </div>}
        </div>}

        {activeSection === "overview" && <div className="sa-control-plane">
          <div className="sa-overview-metrics" role="group" aria-label={t("Indicateurs de gouvernance issus des API")}>
            <Metric label={t("Comptes autorisés")} value={accounts.isLoading || accounts.error ? "—" : accounts.data?.length ?? "—"} icon={<Users size={16} />} tone="blue" t={t} />
            <Metric label={t("Inscriptions en attente")} value={pendingLoading || pendingError ? "—" : pendingRegs.length} icon={<ClipboardCheck size={16} />} tone="amber" t={t} />
            <Metric label={t("Événements chargés")} value={activity.isLoading || activity.error ? "—" : adminEvents.length} icon={<Activity size={16} />} tone="green" t={t} />
            <Metric label={t("Rapports retournés")} value={reports.isLoading || reports.error ? "—" : reports.data?.length ?? "—"} icon={<FileText size={16} />} tone="violet" t={t} />
          </div>
          <div className="sa-control-plane-top-grid">
            <GovernanceCapabilityMatrix />
            <section className="sa-isolation-panel">
              <header><p>{t("ISOLATION DES IDENTITÉS")}</p><h2>{t("Périmètres de gouvernance")}</h2><span>{t("La qualification ne remplace jamais le propriétaire ni le rôle serveur.")}</span></header>
              <div className="sa-isolation-lanes">
                <article><strong>L1–L3</strong><div><b>{t("Espaces personnels")}</b><small>{t("Données métier rattachées à l’identifiant stable du propriétaire.")}</small></div></article>
                <article><strong>L4</strong><div><b>{t("Administration à périmètre borné")}</b><small>{t("Chaque route vérifie le rôle Admin et son périmètre; pas de compteurs globaux.")}</small></div></article>
                <article><strong>L5</strong><div><b>{t("Gouvernance Super-Admin")}</b><small>{t("Les registres globaux autorisés restent soumis aux gardes route-locales et à l’audit.")}</small></div></article>
              </div>
              <div className="sa-isolation-counts">
                <div><span>{t("Comptes retournés par l’API")}</span><strong>{accounts.data?.length ?? 0}</strong></div>
                <div><span>{t("Propriétaires distincts de projets")}</span><strong>{totals.proprietaires_projets ?? 0}</strong></div>
              </div>
              <footer>
                <button type="button" onClick={() => setActiveSection("accounts")}>{t("Ouvrir le registre des comptes")} <ExternalLink size={12} /></button>
                <button type="button" onClick={() => setActiveSection("levels")}>{t("Lire la matrice L1–L5")} <ExternalLink size={12} /></button>
              </footer>
            </section>
          </div>

          <div className="sa-control-plane-middle-grid">
            <section className="sa-overview-approvals"><SectionPanel section="approvals" {...sectionPanelProps} /></section>
            <section className="sa-overview-audit">
              <header className="sa-overview-panel-heading"><div><p>{t("JOURNAL DE GOUVERNANCE")}</p><h2>{t("Événements récents")}</h2><span>{adminEvents.length} · {t("événements fournis par l’API")}</span></div><button type="button" onClick={() => setActiveSection("audit")}>{t("Ouvrir l’audit")} <ExternalLink size={12} /></button></header>
              <AuditEventExplorer events={adminEvents} />
            </section>
          </div>

          <div className="sa-control-plane-bottom-grid">
            <div className="sa-overview-cycle"><GovernanceCycleMap onOpenLevels={() => { setActiveSection("levels"); window.scrollTo({ top: 0, behavior: "smooth" }); }} t={t} /></div>
            <section className="sa-llm-validation-panel">
              <div className="sa-llm-validation-mark"><Activity size={16} /></div>
              <p>{t("CONNECTIVITÉ INTERNE · TEST EXPLICITE")}</p>
              <h2>{t("Gateway LLM AeroMind")}</h2>
              <span>{t("La santé indique uniquement la configuration; la connectivité se vérifie par une action ponctuelle dans la console Admin dédiée.")}</span>
              <Link href="/admin-console" className="sa-llm-validation-link">{t("Ouvrir la console de validation")} <ExternalLink size={13} /></Link>
              <small>{t("Une authentification explicite sur cette console peut être requise. Aucun secret n’est affiché ici.")}</small>
            </section>
          </div>
        </div>}

        {activeSection === "operations" && <div className="mb-7 space-y-5">
          <GovernanceCycleMap onOpenLevels={() => { setActiveSection("levels"); window.scrollTo({ top: 0, behavior: "smooth" }); }} t={t} />
          <SystemHealthPanel />
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"><div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-600">{t("SUPERVISION ET CONDUITE")}</p><h2 className="mt-1 text-lg font-bold text-slate-800">{t("État réel du runtime et modes autorisés")}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{t("Les changements de mode passent par le backend, les gates applicables et les limites VIRTUAL ONLY. Les commandes matérielles ne sont pas lancées depuis ce catalogue.")}</p></div><OperationModeCard /></section>
          <OperationalCapabilitiesPanel />
        </div>}

        {activeSection !== "overview" && <SectionPanel section={activeSection} {...sectionPanelProps} />}

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
                    <th scope="col" aria-sort={sortBy === "name" ? sortDir === "asc" ? "ascending" : "descending" : "none"} className="px-5 py-3 font-semibold"><button type="button" className="sa-sort-button" onClick={() => toggleSort("name")}>{t("Compte")} <span aria-hidden="true">{sortBy === "name" ? sortDir === "asc" ? "▲" : "▼" : "↕"}</span></button></th>
                    <th scope="col" aria-sort={sortBy === "role" ? sortDir === "asc" ? "ascending" : "descending" : "none"} className="font-semibold"><button type="button" className="sa-sort-button" onClick={() => toggleSort("role")}>{t("Rôle")} <span aria-hidden="true">{sortBy === "role" ? sortDir === "asc" ? "▲" : "▼" : "↕"}</span></button></th>
                    <th scope="col">{t("Grade / niveau")}</th>
                    <th scope="col" aria-sort={sortBy === "status" ? sortDir === "asc" ? "ascending" : "descending" : "none"} className="font-semibold"><button type="button" className="sa-sort-button" onClick={() => toggleSort("status")}>{t("Statut")} <span aria-hidden="true">{sortBy === "status" ? sortDir === "asc" ? "▲" : "▼" : "↕"}</span></button></th>
                    <th scope="col" className="pr-5 text-right">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.isLoading ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">{t("Chargement des comptes…")}</td></tr>
                    : rows.map((a: any, idx: number) => {
                      const isSuperAdmin = a.role === "super_admin";
                      return <tr key={a.id} className={`border-t border-slate-100 hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                        <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{(a.name || a.email).slice(0, 2).toUpperCase()}</span><span><strong className="block text-xs">{a.name || t("Sans nom")}</strong><small className="text-[11px] text-slate-400">{a.email}</small></span></div></td>
                        <td><Pill tone={isSuperAdmin ? "blue" : a.role === "surveillant" ? "violet" : a.role === "demo" ? "amber" : a.role === "visitor" ? "slate" : "blue"}>{roleLabel[a.role] || a.role}</Pill></td>
                        <td><div className="flex items-center gap-1.5"><span className="font-semibold text-slate-700">{a.role === "super_admin" ? "L5" : a.role === "admin" ? "L4" : a.level || "L1"}</span><small className="text-[11px] text-slate-400">{a.role === "super_admin" ? t("Super-Admin") : a.role === "admin" ? t("Administration") : a.level === "L3" ? t("Avancé") : a.level === "L2" ? t("Ingénieur") : t("Découverte")}</small>{!isSuperAdmin && a.role !== "admin" && <select aria-label={t(`Niveau de ${a.email}`)} value={a.level || "L1"} onChange={e => update.mutate({ id: a.id, level: e.target.value })} className="rounded border border-slate-200 bg-white px-1 py-1 text-[10px]"><option value="L1">L1</option><option value="L2">L2</option><option value="L3">L3</option></select>}</div></td>
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
                                <button onClick={() => { if (window.confirm(t(`Attribuer un code de connexion LABBENCH à ${a.email} ? L'ancien code quotidien sera révoqué.`))) issueDailyCode.mutate({ id: a.id }); }} disabled={issueDailyCode.isPending} className="inline-flex items-center gap-1 rounded-md border border-cyan-200 px-2 py-1 text-[11px] text-cyan-700 hover:bg-cyan-50"><ShieldCheck size={12} /> {t("Code LABBENCH")}</button>
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
          <label className="text-xs font-semibold text-slate-600">{t("Rôle")}<select value={role} onChange={e => { const nextRole = e.target.value as Role; setRole(nextRole); if (nextRole === "admin") setLevel("L4"); else if (level === "L4" || level === "L5") setLevel("L1"); }} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm"><option value="user">{t("Utilisateur")}</option><option value="demo">{t("Démo")}</option><option value="visitor">{t("Visiteur")}</option><option value="surveillant">{t("Surveillant")}</option><option value="admin">{t("ADMIN")}</option></select></label>
          <label className="text-xs font-semibold text-slate-600">{t("Niveau")}<select value={role === "admin" ? "L4" : level} disabled={role === "admin"} onChange={e => setLevel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm disabled:bg-slate-100"><option value="L1">{t("L1 ·")} {t("Découverte")}</option><option value="L2">{t("L2 ·")} {t("Ingénieur")}</option><option value="L3">{t("L3 ·")} {t("Avancé")}</option>{role === "admin" && <option value="L4">{t("L4 ·")} {t("Administration")}</option>}</select></label>
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


function WatermarkSettings({ t }: { t: (text: string) => string }) {
  const [enabled, setEnabled] = useState(true);
  const [opacity, setOpacity] = useState(0.045);
  const [size, setSize] = useState(520);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aeromind-watermark-settings") || "{}");
      if (typeof saved.enabled === "boolean") setEnabled(saved.enabled);
      if (Number.isFinite(Number(saved.opacity)) && saved.opacity !== undefined) setOpacity(Math.min(0.15, Math.max(0.01, Number(saved.opacity))));
      if (Number.isFinite(Number(saved.size)) && saved.size !== undefined) setSize(Math.min(900, Math.max(180, Number(saved.size))));
    } catch { /* Use defaults if storage is unavailable or malformed. */ }
  }, []);
  const persist = (next: { enabled: boolean; opacity: number; size: number }) => {
    setEnabled(next.enabled); setOpacity(next.opacity); setSize(next.size);
    try {
      localStorage.setItem("aeromind-watermark-settings", JSON.stringify(next));
      window.dispatchEvent(new Event("aeromind-watermark-settings-changed"));
    } catch { toast.error(t("Impossible d’enregistrer les préférences de filigrane dans ce navigateur.")); }
  };
  return <WorkspaceCard title={t("Identité visuelle — filigrane")} subtitle={t("Personnalisez immédiatement le filigrane AeroMind sur les interfaces de cette session navigateur.")} t={t}>
    <div className="space-y-5">
      <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
        <span><strong className="block text-sm">{t("Afficher le filigrane")}</strong><small className="text-xs text-slate-500">{t("Appliqué aux pages AeroMind et à la console Super-Admin.")}</small></span>
        <input type="checkbox" checked={enabled} onChange={e => persist({ enabled: e.target.checked, opacity, size })} className="h-5 w-5 accent-blue-600" aria-label={t("Afficher le filigrane")} />
      </label>
      <label className="block rounded-xl border border-slate-200 p-4">
        <span className="flex items-center justify-between gap-3 text-sm font-semibold"><span>{t("Opacité")}</span><output>{Math.round(opacity * 100)}%</output></span>
        <input type="range" min="1" max="15" value={Math.round(opacity * 100)} onChange={e => persist({ enabled, opacity: Number(e.target.value) / 100, size })} className="mt-3 w-full accent-blue-600" aria-label={t("Opacité du filigrane")} />
        <small className="text-xs text-slate-500">{t("Réglage de 1 % à 15 %.")}</small>
      </label>
      <label className="block rounded-xl border border-slate-200 p-4">
        <span className="flex items-center justify-between gap-3 text-sm font-semibold"><span>{t("Taille du filigrane")}</span><output>{size} px</output></span>
        <input type="range" min="180" max="900" step="20" value={size} onChange={e => persist({ enabled, opacity, size: Number(e.target.value) })} className="mt-3 w-full accent-blue-600" aria-label={t("Taille du filigrane")} />
        <small className="text-xs text-slate-500">{t("Largeur maximale sur écran large ; adaptation automatique sur mobile.")}</small>
      </label>
      <button type="button" onClick={() => persist({ enabled: true, opacity: 0.045, size: 520 })} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t("Rétablir les valeurs par défaut")}</button>
      <p role="status" className="text-xs text-emerald-700">{t("Les changements sont enregistrés dans ce navigateur et appliqués sans rechargement.")}</p>
    </div>
  </WorkspaceCard>;
}

function SectionPanel({ section, totals, activity, reports, reportsLoading, pendingRegs, pendingLoading, pendingError, onRefreshPending, onApproveRegistration, onRejectRegistration, onCreate, onReports, onApprove, onProjectAction, invalidate, t }: { section: Section; totals: any; activity: any; reports?: any[]; reportsLoading: boolean; pendingRegs: any[]; pendingLoading: boolean; pendingError: string; onRefreshPending: () => void; onApproveRegistration: (email: string, name: string) => void; onRejectRegistration: (email: string) => void; onCreate: () => void; onReports: () => void; onApprove: (id: string) => void; onProjectAction: (id: string, action: "save" | "observe" | "delete") => void; invalidate: () => Promise<void>; t: (text: string) => string }) {
  if (section === "accounts" || section === "operations") return null;
  if (section === "approvals") return <WorkspaceCard title={t("Demandes d'accès en attente")} subtitle={t("Examinez les inscriptions préprovisionnées. Chaque décision est appliquée côté serveur et rattachée à la session Super-Admin.")} t={t}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><strong className="block text-xs text-slate-800">{pendingRegs.length} {t("dossier(s) en attente")}</strong><small className="mt-1 block text-[11px] text-slate-500">{t("Les décisions de rejet demandent un motif; les invitations d’activation ne sont affichées qu’après approbation.")}</small></div><button type="button" onClick={onRefreshPending} disabled={pendingLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={13} className={pendingLoading ? "animate-spin" : ""} />{pendingLoading ? t("Actualisation…") : t("Actualiser les demandes")}</button></div>
    {pendingError && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><span>{pendingError}</span><button type="button" onClick={onRefreshPending} className="font-bold underline">{t("Réessayer")}</button></div>}
    {pendingLoading && pendingRegs.length === 0 ? <p role="status" className="rounded-lg bg-slate-50 p-6 text-center text-xs text-slate-500">{t("Chargement du registre d'approbation…")}</p> : pendingRegs.length ? <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t("Demandeur")}</th><th className="px-4 py-3">{t("Rôle demandé")}</th><th className="px-4 py-3">{t("Statut")}</th><th className="px-4 py-3">{t("Demandée le")}</th><th className="px-4 py-3 text-right">{t("Décision")}</th></tr></thead><tbody>{pendingRegs.map((item: any) => <tr key={item.email} className="border-t border-slate-100"><td className="px-4 py-3"><strong className="block text-xs text-slate-800">{item.name || t("Nom non renseigné")}</strong><small className="text-[11px] text-slate-500">{item.email}</small></td><td className="px-4 py-3 text-xs">{item.requested_role || t("Utilisateur")}</td><td className="px-4 py-3"><Pill tone={item.status === "pending_approval" ? "amber" : "blue"}>{item.status || t("En attente")}</Pill></td><td className="px-4 py-3 text-[11px] text-slate-500">{item.requested_at || item.created_at ? new Date(item.requested_at || item.created_at).toLocaleString("fr-FR") : "—"}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => { if (window.confirm(t(`Approuver la demande de ${item.email} et émettre une invitation à usage unique ?`))) onApproveRegistration(item.email, item.name || ""); }} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-800">{t("Approuver")}</button><button type="button" onClick={() => onRejectRegistration(item.email)} className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-red-700">{t("Rejeter")}</button></div></td></tr>)}</tbody></table></div> : <Empty title={t("Aucune demande en attente")} text={t("Les demandes locales préprovisionnées apparaîtront ici après vérification du registre.")} />}
  </WorkspaceCard>;
  if (section === "settings") return <>
    <WorkspaceCard title={t("Paramètres")} subtitle={t("État opérationnel de la console Super-Admin.")} t={t}>
      <div className="grid gap-3 md:grid-cols-3">
        <Info label={t("Comptes actifs")} value={String(totals.actifs ?? 0)} t={t} />
        <Info label={t("Décisions journalisées")} value={String(totals.decisions ?? 0)} t={t} />
        <Info label={t("Session")} value={t("OIDC sécurisée")} t={t} />
      </div>
      <p className="mt-5 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-500">{t("Les paramètres sensibles de déploiement et de fournisseur OIDC restent protégés côté serveur.")}</p>
    </WorkspaceCard>
    <WatermarkSettings t={t} />
  </>;
  if (section === "overview") return <section className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-blue-600">{t("Vue d'ensemble active")}</p><h2 className="mt-2 text-2xl font-bold">{t("Bienvenue dans la gouvernance AeroMind")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("Utilisez le menu de gauche pour ouvrir chaque espace. Les compteurs sont lus depuis le backend, tandis que les décisions sont journalisées.")}</p><div className="mt-5 flex flex-wrap gap-3"><button onClick={onCreate} className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white">{t("Créer un compte")}</button><button onClick={onReports} className="rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-xs font-bold text-blue-700">{t("Ouvrir les rapports")}</button></div></section>;
  if (section === "projects") return <WorkspaceCard title={t("Projets")} subtitle={t("Vue globale des projets AeroMind persistés. Chaque action est contrôlée et journalisée.")} t={t}><div className="space-y-3">{(activity?.projects || []).length ? (activity.projects as any[]).map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><strong className="block text-sm">{p.name || t("Projet sans nom")}</strong><small className="text-xs text-slate-400">{t("Propriétaire")} : {p.userId} · {t("créé")} {p.createdAt ? new Date(p.createdAt).toLocaleDateString("fr-FR") : "—"}</small></div><div className="flex flex-wrap items-center gap-2"><Pill tone={p.controlStatus === "observed" ? "amber" : p.controlStatus === "saved" ? "blue" : "green"}>{p.controlStatus === "observed" ? t("Observation") : p.controlStatus === "saved" ? t("Sauvegardé") : t("Actif")}</Pill><button onClick={() => onProjectAction(String(p.id), "save")} className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1.5 text-[11px] font-semibold text-blue-700"><Save size={13} /> {t("Sauvegarder")}</button><button onClick={() => onProjectAction(String(p.id), "observe")} className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1.5 text-[11px] font-semibold text-amber-700"><Eye size={13} /> {t("Observer")}</button><button onClick={() => onProjectAction(String(p.id), "delete")} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-[11px] font-semibold text-red-600"><Trash2 size={13} /> {t("Supprimer")}</button></div></div>) : <Empty title={t("Aucun projet persistant")} text={t("Les projets créés par les utilisateurs apparaîtront ici.")} />}</div></WorkspaceCard>;
  if (section === "reports") return <WorkspaceCard title={t("Rapports à valider")} subtitle={t("Les rapports suivent le circuit surveillant puis approbation Super-Admin.")} t={t}><div className="space-y-3">{reportsLoading ? <p className="text-sm text-slate-400">{t("Chargement des rapports…")}</p> : (reports || []).filter((r: any) => ["submitted", "reviewed_by_supervisor"].includes(r.status)).map((r: any) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><strong className="block text-sm">{t("Rapport")} {String(r.id).slice(0, 8)}</strong><span className="text-xs text-slate-500">{t("Statut")} : {r.status}</span></div>{r.status === "reviewed_by_supervisor" ? <button onClick={() => onApprove(String(r.id))} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">{t("Approuver définitivement")}</button> : <Pill tone="amber">{t("En attente du surveillant")}</Pill>}</div>)}{!reportsLoading && !(reports || []).some((r: any) => ["submitted", "reviewed_by_supervisor"].includes(r.status)) && <Empty title={t("Aucun rapport en attente")} text={t("Les rapports soumis apparaîtront ici après contrôle.")} />}</div></WorkspaceCard>;
  if (section === "levels") return <WorkspaceCard title={t("Matrice de capacités & périmètres")} subtitle={t("L1–L3 qualifient un compte personnel. L4/L5 résultent des rôles Admin/Super-Admin; la politique backend et les gardes de chaque route demeurent la source d’autorisation.")} t={t}><div className="grid gap-3 md:grid-cols-2">{([["L1", t("Découverte"), t("Workspace personnel · lecture, brouillons et calculs virtuels de base")], ["L2", t("Ingénieur"), t("Workspace personnel · édition d’ingénierie et simulations virtuelles nominales")], ["L3", t("Avancé"), t("Workspace personnel · analyses avancées, workflows, preuves et exports")], ["L4", t("Administration"), t("Rôle Admin · opérations d’administration limitées par chaque route")], ["L5", t("Super-Admin"), t("Rôle Super-Admin · gouvernance globale avec contrôles de route")]] as [string, string, string][]).map(([id, label, text]) => <div key={id} className="rounded-xl border border-slate-200 p-4"><Pill tone="blue">{id}</Pill><strong className="mt-3 block text-sm">{label}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>)}</div><div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t("Rang")}</th><th className="px-4 py-3">{t("Portée métier appliquée")}</th><th className="px-4 py-3">{t("Limite d’isolation")}</th></tr></thead><tbody>{[["L1", t("Lecture, brouillons, calculs virtuels de base"), t("Données de l’identité propriétaire uniquement")], ["L2", t("Édition d’ingénierie, simulation virtuelle nominale"), t("Aucune lecture/écriture inter-utilisateur")], ["L3", t("Analyse avancée, workflow, evidence et export"), t("Aucune élévation implicite au rôle admin")], ["L4", t("Actions d’administration autorisées par rôle et route"), t("Reste soumis aux contrôles locaux et au tenant")], ["L5", t("Gouvernance Super-Admin explicitement autorisée"), t("Aucune exemption des validations ou contrôles de sécurité")]].map(([rank, scope, boundary]) => <tr key={rank} className="border-t border-slate-100"><td className="px-4 py-3 font-bold text-blue-700">{rank}</td><td className="px-4 py-3 text-slate-700">{scope}</td><td className="px-4 py-3 text-slate-500">{boundary}</td></tr>)}</tbody></table></div><p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t("Frontière ferme : les opérations matérielles/temps réel ne sont jamais accordées par un niveau seul. Elles restent soumises aux gardes de route, rôles, approbations humaines et interverrouillages; le mode de démonstration demeure virtuel.")}</p><p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">{t("Chaque compte reçoit un workspaceId stable basé sur son identifiant de registre. Aucune cellule ou aucun projet n’est créé automatiquement à la connexion.")}</p></WorkspaceCard>;
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
    <AuditEventExplorer events={(activity?.adminEvents || []) as any[]} />
  </WorkspaceCard>;
  return <WorkspaceCard title={t("Paramètres")} subtitle={t("État opérationnel de la console Super-Admin.")} t={t}><div className="grid gap-3 md:grid-cols-3"><Info label={t("Comptes actifs")} value={String(totals.actifs ?? 0)} t={t} /><Info label={t("Décisions journalisées")} value={String(totals.decisions ?? 0)} t={t} /><Info label={t("Session")} value={t("OIDC sécurisée")} t={t} /></div><p className="mt-5 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-500">{t("Les paramètres sensibles de déploiement et de fournisseur OIDC restent protégés côté serveur.")}</p></WorkspaceCard>;
}
function WorkspaceCard({ title, subtitle, children, t }: { title: string; subtitle: string; children: React.ReactNode; t: (text: string) => string }) { return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">{title}</h2><p className="mt-1 mb-5 text-sm text-slate-400">{subtitle}</p>{children}<p className="mt-4 text-[10px] text-slate-400">{t("Action journalisée · traçable côté serveur")}</p></section>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center"><strong className="block text-sm">{title}</strong><p className="mt-1 text-xs text-slate-400">{text}</p></div>; }

function Nav({ icon, label, active = false, onClick, badge }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; badge?: number }) { return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${active ? "bg-blue-500/15 font-semibold text-blue-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{icon}<span>{label}</span>{badge !== undefined && badge > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{badge}</span>}</button>; }
function Metric({ label, value, icon, tone, t }: { label: string; value: number | string; icon: React.ReactNode; tone: string; t: (text: string) => string }) { const colors: Record<string, string> = { blue: "bg-blue-50 text-blue-600", violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600" }; return <div className="sa-metric rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone] || colors.blue}`}>{icon}</span><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t("Données API")}</span></div><strong className="mt-4 block text-2xl">{value}</strong><span className="text-xs text-slate-400">{label}</span></div>; }
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
