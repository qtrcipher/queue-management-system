import React, { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { TFunction } from "i18next";
import { ArrowRightLeft, BarChart3, Building2, CalendarClock, CheckCircle2, Download, Languages, Mail, Monitor, RotateCcw, Ticket, Trash2, Undo2, UserRound, UsersRound, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { io } from "socket.io-client";
import "./i18n.js";
import "./styles.css";

type Service = { id: string; nameEn: string; nameAr: string; prefix: string; isActive?: boolean };
type Counter = { id: string; nameEn: string; nameAr: string; isOpen?: boolean };
type Branch = { id: string; slug: string; nameEn: string; nameAr: string; services: Service[]; counters: Counter[] };
type User = { id: string; email: string; name: string; role: string };
type TicketRecord = {
  id: string;
  code: string;
  status: string;
  source?: "WALK_IN" | "APPOINTMENT";
  scheduledFor?: string | null;
  customerName?: string | null;
  service?: Service;
  counter?: Counter | null;
  events?: { status: string; note?: string }[];
};
type AppointmentRecord = TicketRecord & { branch: Branch; service: Service; counter?: Counter | null };
type Snapshot = { waiting: TicketRecord[]; called: TicketRecord[]; serving: TicketRecord[]; updatedAt?: string };
type NotificationSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
  ticketEmailSubject: string;
  ticketEmailBody: string;
  ticketSmsTemplate: string;
};
type AdminOverview = {
  organization: ({ name: string; ticketRetentionDays: number; branches: Branch[]; users: User[] } & NotificationSettings) | null;
  appointments: AppointmentRecord[];
};
type PurgeResult = { deleted: number; cutoff: string; retentionDays: number };
type AnalyticsSummary = {
  range: { start: string; end: string; branchId: string | null };
  totals: {
    issued: number;
    waiting: number;
    called: number;
    serving: number;
    completed: number;
    noShow: number;
    cancelled: number;
    transferred: number;
    averageWaitMinutes: number;
    averageServiceMinutes: number;
    completionRate: number;
    noShowRate: number;
  };
  services: { serviceId: string; prefix: string; nameEn: string; nameAr: string; issued: number; completed: number; noShow: number; averageWaitMinutes: number; averageServiceMinutes: number }[];
  branchDashboard: {
    branchId: string;
    slug: string;
    nameEn: string;
    nameAr: string;
    services: number;
    openCounters: number;
    issued: number;
    waiting: number;
    serving: number;
    completed: number;
    noShow: number;
    averageWaitMinutes: number;
  }[];
};
type TicketStatusView = {
  ticket: TicketRecord;
  branch: Branch;
  service: Service;
  counter: Counter | null;
  position: number;
  numberAhead: number;
  estimatedWaitMinutes: number;
  activeCounters: number;
  updatedAt: string;
};

const apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

function App() {
  const { i18n, t } = useTranslation();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ waiting: [], called: [], serving: [] });
  const [message, setMessage] = useState("");
  const path = window.location.pathname;
  const dir = i18n.language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = dir;
  }, [dir, i18n.language]);

  useEffect(() => {
    void loadPublicBranch().then((loadedBranch) => {
      setBranch(loadedBranch);
      if (loadedBranch) void refreshSnapshot(loadedBranch.id);
    });
    void api<{ authenticated: boolean; user: User }>("/auth/me").then((result) => setUser(result.user)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!branch) return;
    const socket = io(apiBase, { withCredentials: true });
    const refresh = () => void refreshSnapshot(branch.id);
    socket.on("ticket.created", refresh);
    socket.on("ticket.called", refresh);
    socket.on("ticket.updated", refresh);
    return () => {
      socket.disconnect();
    };
  }, [branch]);

  useEffect(() => {
    document.title = `${pageTitle(path, t)} | QMS`;
  }, [path, t]);

  async function refreshSnapshot(branchId: string) {
    const data = await api<Snapshot>(`/display/${branchId}`);
    setSnapshot(data);
  }

  const context = { branch, user, snapshot, setBranch, setUser, refreshSnapshot, message, setMessage };

  return (
    <>
      <a className="skip-link" href="#main-content">{t("skipToMain")}</a>
      <Shell
        user={user}
        branch={branch}
        path={path}
        onLanguage={() => void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")}
      />
      {message ? <div className="toast" role="status">{message}</div> : null}
      <main id="main-content" tabIndex={-1}>
        {path.startsWith("/admin") ? <AdminPage {...context} /> : null}
        {path.startsWith("/staff") ? <StaffPage {...context} /> : null}
        {path.startsWith("/display") ? <DisplayPage {...context} /> : null}
        {path.startsWith("/ticket/") ? <TicketPage ticketId={path.split("/").at(-1) ?? ""} /> : null}
        {path.startsWith("/join") || path.startsWith("/kiosk") || path === "/" ? <KioskPage {...context} /> : null}
      </main>
    </>
  );
}

function Shell({ user, branch, path, onLanguage }: { user: User | null; branch: Branch | null; path: string; onLanguage: () => void }) {
  const { i18n, t } = useTranslation();
  const branchName = localName(branch, i18n.language);
  const navItems = [
    { href: "/kiosk", label: t("kiosk"), active: path === "/" || path.startsWith("/kiosk") || path.startsWith("/join") },
    { href: "/staff", label: t("staff"), active: path.startsWith("/staff") },
    { href: "/display", label: t("display"), active: path.startsWith("/display") },
    { href: "/admin", label: t("admin"), active: path.startsWith("/admin") }
  ];

  return (
    <header className="app-shell">
      <a className="brand" href="/">
        <Ticket size={24} aria-hidden="true" />
        <span>QMS</span>
      </a>
      <nav aria-label={t("primaryNav")}>
        {navItems.map((item) => (
          <a key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="shell-actions">
        <span>{branchName || t("mainBranch")}</span>
        {user ? <span>{user.name}</span> : null}
        <button className="icon-button" onClick={onLanguage} aria-label={t("changeLanguage")}>
          <Languages size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin12345");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const user = await api<User>("/auth/login", { method: "POST", body: { email, password } });
      onLogin(user);
    } catch {
      setError(t("loginFailed"));
    }
  }

  return (
    <section className="auth-panel">
      <div className="panel-title">
        <UserRound size={18} />
        <h1>{t("signIn")}</h1>
      </div>
      <form onSubmit={(event) => void submit(event)} className="form-grid">
        <label>
          {t("email")}
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" aria-invalid={Boolean(error)} required />
        </label>
        <label>
          {t("password")}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={Boolean(error)} required />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button">{t("signIn")}</button>
      </form>
    </section>
  );
}

function KioskPage({ branch, setMessage }: AppContext) {
  const { i18n, t } = useTranslation();
  const [createdTicket, setCreatedTicket] = useState<TicketRecord | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const services = branch?.services ?? [];
  const joinUrl = `${window.location.origin}/join/${branch?.slug ?? "main"}`;
  const ticketUrl = createdTicket ? `${window.location.origin}/ticket/${createdTicket.id}` : joinUrl;

  async function createTicket(serviceId: string) {
    if (!branch) return;
    const ticket = await api<TicketRecord>("/tickets", {
      method: "POST",
      body: {
        branchId: branch.id,
        serviceId,
        ...(customerName ? { customerName } : {}),
        ...(customerEmail ? { customerEmail } : {}),
        ...(customerPhone ? { customerPhone } : {})
      }
    });
    setCreatedTicket(ticket);
    setMessage(t("ticketCreated", { code: ticket.code }));
  }

  return (
    <section className="page-grid kiosk-layout">
      <div className="hero-panel">
        <h1>{t("chooseService")}</h1>
        <p>{t("subtitle")}</p>
        <div className="customer-fields">
          <label>
            {t("name")}
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" />
          </label>
          <label>
            {t("email")}
            <input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            {t("phone")}
            <input type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} autoComplete="tel" />
          </label>
        </div>
        <div className="service-list kiosk-services">
          {services.map((service) => (
            <button key={service.id} onClick={() => void createTicket(service.id)}>
              <strong>{localName(service, i18n.language)}</strong>
              <span>{service.prefix}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ticket-preview" aria-live="polite">
        {createdTicket ? (
          <>
            <span>{t("yourTicket")}</span>
            <strong>{createdTicket.code}</strong>
            <QrPanel value={ticketUrl} label={t("scanTrackPlace")} />
            <a href={`/ticket/${createdTicket.id}`}>{t("trackTicket")}</a>
          </>
        ) : (
          <>
            <span>{t("customer")}</span>
            <QrPanel value={joinUrl} label={t("scanJoinPhone")} />
            <small>{new URL(joinUrl).pathname}</small>
          </>
        )}
      </div>
    </section>
  );
}

function StaffPage(context: AppContext) {
  const { branch, user, setUser, snapshot, refreshSnapshot, setMessage } = context;
  const { i18n, t } = useTranslation();
  const activeTickets = useMemo(() => [...snapshot.called, ...snapshot.serving], [snapshot.called, snapshot.serving]);
  const [selectedCounterId, setSelectedCounterId] = useState("");

  useEffect(() => {
    if (!branch) return;
    setSelectedCounterId((current) => branch.counters.some((counter) => counter.id === current) ? current : branch.counters[0]?.id ?? "");
  }, [branch]);

  if (!user) return <LoginPanel onLogin={setUser} />;
  if (!branch) return <EmptyState label={t("noBranchConfigured")} />;

  async function callNext(serviceId: string) {
    if (!branch) return;
    const ticket = await api<TicketRecord | null>(`/staff/${branch.id}/services/${serviceId}/call-next`, {
      method: "POST",
      body: { counterId: selectedCounterId || undefined }
    });
    setMessage(ticket ? t("calledTicket", { code: ticket.code }) : t("noWaitingTickets"));
    await refreshSnapshot(branch.id);
  }

  async function action(ticketId: string, actionName: "start" | "complete" | "no-show" | "recall" | "requeue" | "cancel") {
    if (!branch) return;
    await api<TicketRecord>(`/staff/tickets/${ticketId}/${actionName}`, { method: "POST" });
    setMessage(t("ticketUpdated"));
    await refreshSnapshot(branch.id);
  }

  async function transfer(ticketId: string, serviceId: string) {
    if (!branch || !serviceId) return;
    await api<TicketRecord>(`/staff/tickets/${ticketId}/transfer`, { method: "POST", body: { serviceId } });
    setMessage(t("ticketTransferred"));
    await refreshSnapshot(branch.id);
  }

  return (
    <section className="page-grid">
      <h1 className="sr-only">{t("staff")}</h1>
      <Panel title={t("staff")} icon={<UsersRound size={18} />}>
        <label className="counter-selector">
          {t("counter")}
          <select value={selectedCounterId} onChange={(event) => setSelectedCounterId(event.target.value)}>
            {branch.counters.map((counter) => (
              <option key={counter.id} value={counter.id}>{localName(counter, i18n.language)}</option>
            ))}
          </select>
        </label>
        <div className="service-list compact">
          {branch.services.map((service) => (
            <button key={service.id} onClick={() => void callNext(service.id)}>
              {t("callNext")} · {service.prefix} · {localName(service, i18n.language)}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={t("activeTickets")} icon={<Ticket size={18} />}>
        <TicketStack tickets={activeTickets} services={branch.services} onAction={action} onTransfer={transfer} />
      </Panel>
      <Panel title={t("waiting")} icon={<RotateCcw size={18} />}>
        <TicketStack tickets={snapshot.waiting} services={branch.services} onAction={action} onTransfer={transfer} />
      </Panel>
    </section>
  );
}

function DisplayPage({ branch, snapshot }: AppContext) {
  const { i18n, t } = useTranslation();
  const activeTickets = [...snapshot.called, ...snapshot.serving].slice(0, 8);

  return (
    <section className="display-screen" aria-live="polite">
      <div>
        <h1>{localName(branch, i18n.language) || t("display")}</h1>
        <p>{new Date().toLocaleTimeString()}</p>
      </div>
      <div className="display-board">
        {activeTickets.map((ticket) => (
          <div className="display-ticket" key={ticket.id}>
            <strong>{ticket.code}</strong>
            <span>{localName(ticket.counter, i18n.language) || t("counter")}</span>
          </div>
        ))}
        {activeTickets.length === 0 ? <EmptyState label={t("noTicketsCalled")} /> : null}
      </div>
    </section>
  );
}

function AdminPage({ user, setUser, setBranch, setMessage }: AppContext) {
  const { i18n, t } = useTranslation();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchSlug, setBranchSlug] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [analyticsBranchId, setAnalyticsBranchId] = useState("");
  const [analyticsStart, setAnalyticsStart] = useState(todayInputValue());
  const [analyticsEnd, setAnalyticsEnd] = useState(todayInputValue());
  const [serviceName, setServiceName] = useState("");
  const [servicePrefix, setServicePrefix] = useState("");
  const [counterName, setCounterName] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("AGENT");
  const [appointmentServiceId, setAppointmentServiceId] = useState("");
  const [appointmentTime, setAppointmentTime] = useState(defaultAppointmentInputValue());
  const [appointmentName, setAppointmentName] = useState("");
  const [appointmentEmail, setAppointmentEmail] = useState("");
  const [appointmentPhone, setAppointmentPhone] = useState("");
  const [ticketRetentionDays, setTicketRetentionDays] = useState(365);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    smtpHost: "localhost",
    smtpPort: 1025,
    smtpFrom: "QMS <no-reply@example.com>",
    ticketEmailSubject: "Your queue ticket is {{code}}",
    ticketEmailBody: "Your ticket number is {{code}} for {{serviceName}}. Track it at {{ticketUrl}}.",
    ticketSmsTemplate: "Your queue ticket is {{code}}"
  });
  const loadAdminRequestId = useRef(0);

  useEffect(() => {
    if (user) void loadAdmin();
  }, [user]);

  const branches = overview?.organization?.branches ?? [];
  const analyticsQuery = useMemo(() => {
    return analyticsQueryString(analyticsBranchId, analyticsStart, analyticsEnd);
  }, [analyticsBranchId, analyticsEnd, analyticsStart]);
  const analyticsPath = `/analytics/summary${analyticsQuery ? `?${analyticsQuery}` : ""}`;
  const analyticsCsvPath = `${apiBase}/analytics/tickets.csv${analyticsQuery ? `?${analyticsQuery}` : ""}`;

  useEffect(() => {
    const nextBranch = branches.find((branch) => branch.id === selectedBranchId) ?? branches[0];
    if (!nextBranch) return;
    setAppointmentServiceId((current) => nextBranch.services.some((service) => service.id === current) ? current : nextBranch.services[0]?.id ?? "");
  }, [branches, selectedBranchId]);

  if (!user) return <LoginPanel onLogin={setUser} />;

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? branches[0];

  async function loadAdmin(preferredBranchId?: string) {
    const requestId = loadAdminRequestId.current + 1;
    loadAdminRequestId.current = requestId;
    const [overviewData, analyticsData] = await Promise.all([
      api<AdminOverview>("/admin/bootstrap"),
      api<AnalyticsSummary>(analyticsPath)
    ]);
    if (requestId !== loadAdminRequestId.current) return;
    setOverview(overviewData);
    setAnalytics(analyticsData);
    setTicketRetentionDays(overviewData.organization?.ticketRetentionDays ?? 365);
    if (overviewData.organization) {
      setNotificationSettings({
        smtpHost: overviewData.organization.smtpHost,
        smtpPort: overviewData.organization.smtpPort,
        smtpFrom: overviewData.organization.smtpFrom,
        ticketEmailSubject: overviewData.organization.ticketEmailSubject,
        ticketEmailBody: overviewData.organization.ticketEmailBody,
        ticketSmsTemplate: overviewData.organization.ticketSmsTemplate
      });
    }
    const nextBranches = overviewData.organization?.branches ?? [];
    const nextBranchId = preferredBranchId ?? selectedBranchId;
    const nextBranch = nextBranches.find((branch) => branch.id === nextBranchId) ?? nextBranches[0] ?? null;
    setSelectedBranchId(nextBranch?.id ?? "");
    setBranch(nextBranch);
  }

  async function createBranch(event: FormEvent) {
    event.preventDefault();
    const created = await api<Branch>("/admin/branches", {
      method: "POST",
      body: { nameEn: branchName, nameAr: branchName, slug: branchSlug }
    });
    setBranchName("");
    setBranchSlug("");
    setMessage(t("branchCreated"));
    await loadAdmin(created.id);
  }

  async function createService(event: FormEvent) {
    event.preventDefault();
    if (!selectedBranch) return;
    await api<Service>(`/admin/branches/${selectedBranch.id}/services`, {
      method: "POST",
      body: { nameEn: serviceName, nameAr: serviceName, prefix: servicePrefix.toUpperCase() }
    });
    setServiceName("");
    setServicePrefix("");
    setMessage(t("serviceCreated"));
    await loadAdmin(selectedBranch.id);
  }

  async function createCounter(event: FormEvent) {
    event.preventDefault();
    if (!selectedBranch) return;
    await api<Counter>(`/admin/branches/${selectedBranch.id}/counters`, {
      method: "POST",
      body: { nameEn: counterName, nameAr: counterName }
    });
    setCounterName("");
    setMessage(t("counterCreated"));
    await loadAdmin(selectedBranch.id);
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    await api<User>("/admin/users", {
      method: "POST",
      body: { name: userName, email: userEmail, password: userPassword, role: userRole }
    });
    setUserName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("AGENT");
    setMessage(t("userCreated"));
    await loadAdmin(selectedBranch?.id);
  }

  async function scheduleAppointment(event: FormEvent) {
    event.preventDefault();
    if (!selectedBranch || !appointmentServiceId) return;
    await api<AppointmentRecord>("/admin/appointments", {
      method: "POST",
      body: {
        branchId: selectedBranch.id,
        serviceId: appointmentServiceId,
        scheduledFor: new Date(appointmentTime).toISOString(),
        customerName: appointmentName,
        ...(appointmentEmail ? { customerEmail: appointmentEmail } : {}),
        ...(appointmentPhone ? { customerPhone: appointmentPhone } : {})
      }
    });
    setAppointmentName("");
    setAppointmentEmail("");
    setAppointmentPhone("");
    setAppointmentTime(defaultAppointmentInputValue());
    setMessage(t("appointmentScheduled"));
    await loadAdmin(selectedBranch.id);
  }

  async function updateRetention(event: FormEvent) {
    event.preventDefault();
    loadAdminRequestId.current += 1;
    const form = event.currentTarget as HTMLFormElement;
    const retentionDays = Number(new FormData(form).get("ticketRetentionDays"));
    const updated = await api<{ ticketRetentionDays: number }>("/admin/organization/settings", {
      method: "PATCH",
      body: { ticketRetentionDays: retentionDays }
    });
    setTicketRetentionDays(updated.ticketRetentionDays);
    setOverview((current) => current?.organization
      ? { ...current, organization: { ...current.organization, ticketRetentionDays: updated.ticketRetentionDays } }
      : current);
    setMessage(t("retentionUpdated"));
  }

  async function purgeTickets() {
    const result = await api<PurgeResult>("/admin/maintenance/purge-tickets", { method: "POST" });
    setMessage(t("ticketsPurged", { count: result.deleted }));
    await loadAdmin(selectedBranch?.id);
  }

  async function updateNotifications(event: FormEvent) {
    event.preventDefault();
    await api<NotificationSettings>("/admin/organization/settings", {
      method: "PATCH",
      body: notificationSettings
    });
    setMessage(t("notificationsUpdated"));
    await loadAdmin(selectedBranch?.id);
  }

  function updateNotificationField<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    setNotificationSettings((current) => ({ ...current, [key]: value }));
  }

  function changeManagedBranch(branchId: string) {
    const nextBranch = branches.find((branch) => branch.id === branchId) ?? null;
    setSelectedBranchId(branchId);
    setBranch(nextBranch);
  }

  async function applyAnalyticsFilters(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const branchId = String(formData.get("analyticsBranchId") ?? "");
    const start = String(formData.get("analyticsStart") ?? "");
    const end = String(formData.get("analyticsEnd") ?? "");
    const query = analyticsQueryString(branchId, start, end);
    setAnalyticsBranchId(branchId);
    setAnalyticsStart(start);
    setAnalyticsEnd(end);
    const data = await api<AnalyticsSummary>(`/analytics/summary${query ? `?${query}` : ""}`);
    setAnalytics(data);
    setMessage(t("analyticsApplied"));
  }

  return (
    <section className="page-grid">
      <h1 className="sr-only">{t("admin")}</h1>
      <Panel title={t("today")} icon={<BarChart3 size={18} />}>
        <form className="analytics-filters" onSubmit={(event) => void applyAnalyticsFilters(event)}>
          <label>
            {t("analyticsBranch")}
            <select name="analyticsBranchId" value={analyticsBranchId} onChange={(event) => setAnalyticsBranchId(event.target.value)}>
              <option value="">{t("allBranches")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{localName(branch, i18n.language)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("startDate")}
            <input type="date" name="analyticsStart" value={analyticsStart} onChange={(event) => setAnalyticsStart(event.target.value)} />
          </label>
          <label>
            {t("endDate")}
            <input type="date" name="analyticsEnd" value={analyticsEnd} onChange={(event) => setAnalyticsEnd(event.target.value)} />
          </label>
          <button className="primary-button">{t("applyFilters")}</button>
        </form>
        <div className="metric-grid">
          <Metric label={t("issued")} value={analytics?.totals.issued ?? 0} />
          <Metric label={t("waiting")} value={analytics?.totals.waiting ?? 0} />
          <Metric label={t("completed")} value={analytics?.totals.completed ?? 0} />
          <Metric label={t("noShow")} value={`${analytics?.totals.noShowRate ?? 0}%`} />
          <Metric label={t("avgWait")} value={`${analytics?.totals.averageWaitMinutes ?? 0}m`} />
          <Metric label={t("avgService")} value={`${analytics?.totals.averageServiceMinutes ?? 0}m`} />
        </div>
        <div className="branch-dashboard" aria-label={t("branchDashboard")}>
          <div className="dashboard-header">
            <strong>{t("branchDashboard")}</strong>
            <span>{t("branchesCount", { count: analytics?.branchDashboard.length ?? 0 })}</span>
          </div>
          <div className="dashboard-table" role="table" aria-label={t("branchDashboard")}>
            <div className="dashboard-row dashboard-heading" role="row">
              <span role="columnheader">{t("branch")}</span>
              <span role="columnheader">{t("issued")}</span>
              <span role="columnheader">{t("waiting")}</span>
              <span role="columnheader">{t("servingColumn")}</span>
              <span role="columnheader">{t("completed")}</span>
              <span role="columnheader">{t("openCounters")}</span>
              <span role="columnheader">{t("avgWait")}</span>
            </div>
            {analytics?.branchDashboard.map((row) => (
              <div className="dashboard-row" role="row" key={row.branchId}>
                <span role="cell">
                  <strong>{localName(row, i18n.language)}</strong>
                  <small>/{row.slug}</small>
                </span>
                <span role="cell">{row.issued}</span>
                <span role="cell">{row.waiting}</span>
                <span role="cell">{row.serving}</span>
                <span role="cell">{row.completed}</span>
                <span role="cell">{row.openCounters}</span>
                <span role="cell">{row.averageWaitMinutes}m</span>
              </div>
            ))}
          </div>
        </div>
        <a className="download-link" href={analyticsCsvPath}>
          <Download size={16} />
          {t("exportCsv")}
        </a>
      </Panel>
      <Panel title={t("maintenance")} icon={<Trash2 size={18} />}>
        <form onSubmit={(event) => void updateRetention(event)} className="form-grid">
          <label>
            {t("ticketRetentionDays")}
            <input
              type="number"
              min={1}
              max={3650}
              name="ticketRetentionDays"
              value={ticketRetentionDays}
              onChange={(event) => setTicketRetentionDays(Number(event.target.value))}
              required
            />
          </label>
          <button className="primary-button">{t("saveRetention")}</button>
        </form>
        <button className="danger-button" onClick={() => void purgeTickets()}>
          {t("purgeOldTickets")}
        </button>
      </Panel>
      <Panel title={t("appointments")} icon={<CalendarClock size={18} />}>
        <div className="appointment-list" aria-label={t("upcomingAppointments")}>
          {(overview?.appointments ?? [])
            .filter((appointment) => !selectedBranch || appointment.branch.id === selectedBranch.id)
            .map((appointment) => (
              <div key={appointment.id} className="appointment-row">
                <strong>{appointment.code}</strong>
                <span>{appointment.customerName || t("guest")} · {appointment.service.prefix} · {formatAppointmentTime(appointment.scheduledFor, t)}</span>
                <small>{appointment.status}</small>
              </div>
            ))}
          {(overview?.appointments ?? []).filter((appointment) => !selectedBranch || appointment.branch.id === selectedBranch.id).length === 0
            ? <EmptyState label={t("noActiveAppointments")} />
            : null}
        </div>
        <form onSubmit={(event) => void scheduleAppointment(event)} className="form-grid">
          <label>
            {t("service")}
            <select value={appointmentServiceId} onChange={(event) => setAppointmentServiceId(event.target.value)} required>
              {selectedBranch?.services.map((service) => (
                <option key={service.id} value={service.id}>{service.prefix} · {localName(service, i18n.language)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("appointmentTime")}
            <input type="datetime-local" value={appointmentTime} onChange={(event) => setAppointmentTime(event.target.value)} required />
          </label>
          <label>{t("name")}<input value={appointmentName} onChange={(event) => setAppointmentName(event.target.value)} minLength={2} required /></label>
          <div className="inline-form notification-server-fields">
            <label>{t("email")}<input type="email" value={appointmentEmail} onChange={(event) => setAppointmentEmail(event.target.value)} /></label>
            <label>{t("phone")}<input type="tel" value={appointmentPhone} onChange={(event) => setAppointmentPhone(event.target.value)} /></label>
            <button className="primary-button">{t("schedule")}</button>
          </div>
        </form>
      </Panel>
      <Panel title={t("notifications")} icon={<Mail size={18} />}>
        <form onSubmit={(event) => void updateNotifications(event)} className="form-grid">
          <div className="inline-form notification-server-fields">
            <label>
              {t("smtpHost")}
              <input value={notificationSettings.smtpHost} onChange={(event) => updateNotificationField("smtpHost", event.target.value)} required />
            </label>
            <label>
              {t("smtpPort")}
              <input
                type="number"
                min={1}
                max={65535}
                value={notificationSettings.smtpPort}
                onChange={(event) => updateNotificationField("smtpPort", Number(event.target.value))}
                required
              />
            </label>
          </div>
          <label>
            {t("fromAddress")}
            <input value={notificationSettings.smtpFrom} onChange={(event) => updateNotificationField("smtpFrom", event.target.value)} required />
          </label>
          <label>
            {t("emailSubject")}
            <input value={notificationSettings.ticketEmailSubject} onChange={(event) => updateNotificationField("ticketEmailSubject", event.target.value)} required />
          </label>
          <label>
            {t("emailBody")}
            <textarea rows={4} value={notificationSettings.ticketEmailBody} onChange={(event) => updateNotificationField("ticketEmailBody", event.target.value)} required />
          </label>
          <label>
            {t("smsTemplate")}
            <textarea rows={2} value={notificationSettings.ticketSmsTemplate} onChange={(event) => updateNotificationField("ticketSmsTemplate", event.target.value)} required />
          </label>
          <button className="primary-button">{t("saveNotifications")}</button>
        </form>
      </Panel>
      <Panel title={t("branches")} icon={<Building2 size={18} />}>
        <div className="table-list">
          {branches.map((branch) => (
            <div key={branch.id}>
              <strong>{localName(branch, i18n.language)}</strong>
              <span>/{branch.slug}</span>
            </div>
          ))}
        </div>
        {branches.length ? (
          <label className="branch-selector">
            {t("manageBranch")}
            <select value={selectedBranch?.id ?? ""} onChange={(event) => changeManagedBranch(event.target.value)}>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{localName(branch, i18n.language)}</option>
              ))}
            </select>
          </label>
        ) : null}
        <form onSubmit={(event) => void createBranch(event)} className="form-grid">
          <label>{t("branchName")}<input value={branchName} onChange={(event) => setBranchName(event.target.value)} required /></label>
          <label>{t("slug")}<input value={branchSlug} onChange={(event) => setBranchSlug(event.target.value)} pattern="[a-z0-9-]+" required /></label>
          <button className="primary-button">{t("addBranch")}</button>
        </form>
      </Panel>
      <Panel title={t("services")} icon={<Ticket size={18} />}>
        <div className="record-list">
          {selectedBranch?.services.map((service) => (
            <ServiceEditor
              key={service.id}
              service={service}
              issued={analytics?.services.find((row) => row.serviceId === service.id)?.issued ?? 0}
              onSave={async (serviceId, body) => {
                await api<Service>(`/admin/services/${serviceId}`, { method: "PATCH", body });
                setMessage(t("serviceUpdated"));
                await loadAdmin(selectedBranch.id);
              }}
            />
          ))}
        </div>
        <form onSubmit={(event) => void createService(event)} className="form-grid inline-form">
          <label>{t("name")}<input value={serviceName} onChange={(event) => setServiceName(event.target.value)} required /></label>
          <label>{t("prefix")}<input value={servicePrefix} onChange={(event) => setServicePrefix(event.target.value.toUpperCase())} pattern="[A-Z0-9]{1,4}" required /></label>
          <button className="primary-button">{t("addService")}</button>
        </form>
      </Panel>
      <Panel title={t("counters")} icon={<Monitor size={18} />}>
        <div className="record-list">
          {selectedBranch?.counters.map((counter) => (
            <CounterEditor
              key={counter.id}
              counter={counter}
              onSave={async (counterId, body) => {
                await api<Counter>(`/admin/counters/${counterId}`, { method: "PATCH", body });
                setMessage(t("counterUpdated"));
                await loadAdmin(selectedBranch.id);
              }}
            />
          ))}
        </div>
        <form onSubmit={(event) => void createCounter(event)} className="form-grid">
          <label>{t("counterName")}<input value={counterName} onChange={(event) => setCounterName(event.target.value)} required /></label>
          <button className="primary-button">{t("addCounter")}</button>
        </form>
      </Panel>
      <Panel title={t("users")} icon={<UserRound size={18} />}>
        <div className="record-list">
          {overview?.organization?.users.map((account) => (
            <UserEditor
              key={account.id}
              account={account}
              onSave={async (userId, body) => {
                await api<User>(`/admin/users/${userId}`, { method: "PATCH", body });
                setMessage(t("userUpdated"));
                await loadAdmin(selectedBranch?.id);
              }}
            />
          ))}
        </div>
        <form onSubmit={(event) => void createUser(event)} className="form-grid">
          <label>{t("name")}<input value={userName} onChange={(event) => setUserName(event.target.value)} required /></label>
          <label>{t("email")}<input type="email" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} required /></label>
          <label>{t("password")}<input type="password" minLength={8} value={userPassword} onChange={(event) => setUserPassword(event.target.value)} required /></label>
          <label>
            {t("role")}
            <select value={userRole} onChange={(event) => setUserRole(event.target.value)}>
              <option value="ADMIN">{t("admin")}</option>
              <option value="BRANCH_MANAGER">{t("branchManager")}</option>
              <option value="AGENT">{t("agent")}</option>
              <option value="DISPLAY">{t("display")}</option>
            </select>
          </label>
          <button className="primary-button">{t("addUser")}</button>
        </form>
      </Panel>
    </section>
  );
}

function ServiceEditor({ service, issued, onSave }: { service: Service; issued: number; onSave: (serviceId: string, body: { nameEn: string; nameAr: string; isActive: boolean }) => Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(service.nameEn);
  const [isActive, setIsActive] = useState(service.isActive !== false);

  useEffect(() => {
    setName(service.nameEn);
    setIsActive(service.isActive !== false);
  }, [service]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(service.id, { nameEn: name, nameAr: name, isActive });
  }

  return (
    <form className="record-row" aria-label={t("editService", { prefix: service.prefix })} onSubmit={(event) => void submit(event)}>
      <div className="record-meta">
        <strong>{service.prefix}</strong>
        <span>{t("issuedCount", { count: issued })}</span>
      </div>
      <label>
        {t("name")}
        <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
        {t("active")}
      </label>
      <button className="primary-button">{t("save")}</button>
    </form>
  );
}

function CounterEditor({ counter, onSave }: { counter: Counter; onSave: (counterId: string, body: { nameEn: string; nameAr: string; isOpen: boolean }) => Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(counter.nameEn);
  const [isOpen, setIsOpen] = useState(counter.isOpen !== false);

  useEffect(() => {
    setName(counter.nameEn);
    setIsOpen(counter.isOpen !== false);
  }, [counter]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(counter.id, { nameEn: name, nameAr: name, isOpen });
  }

  return (
    <form className="record-row" aria-label={t("editCounter", { name: counter.nameEn })} onSubmit={(event) => void submit(event)}>
      <div className="record-meta">
        <strong>{counter.nameEn}</strong>
        <span>{isOpen ? t("open") : t("closed")}</span>
      </div>
      <label>
        {t("name")}
        <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={isOpen} onChange={(event) => setIsOpen(event.target.checked)} />
        {t("open")}
      </label>
      <button className="primary-button">{t("save")}</button>
    </form>
  );
}

function UserEditor({ account, onSave }: { account: User; onSave: (userId: string, body: { name: string; role: string; password?: string }) => Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(account.name);
  const [role, setRole] = useState(account.role);
  const [password, setPassword] = useState("");

  useEffect(() => {
    setName(account.name);
    setRole(account.role);
    setPassword("");
  }, [account]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(account.id, { name, role, ...(password ? { password } : {}) });
  }

  return (
    <form className="record-row user-record-row" aria-label={t("editUser", { email: account.email })} onSubmit={(event) => void submit(event)}>
      <div className="record-meta">
        <strong>{account.email}</strong>
        <span>{account.role}</span>
      </div>
      <label>
        {t("name")}
        <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
      </label>
      <label>
        {t("role")}
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="OWNER">{t("owner")}</option>
          <option value="ADMIN">{t("admin")}</option>
          <option value="BRANCH_MANAGER">{t("branchManager")}</option>
          <option value="AGENT">{t("agent")}</option>
          <option value="DISPLAY">{t("display")}</option>
        </select>
      </label>
      <label>
        {t("newPassword")}
        <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("leaveBlankToKeep")} />
      </label>
      <button className="primary-button">{t("save")}</button>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TicketPage({ ticketId }: { ticketId: string }) {
  const { i18n, t } = useTranslation();
  const [status, setStatus] = useState<TicketStatusView | null>(null);

  useEffect(() => {
    const load = () => void api<TicketStatusView>(`/tickets/${ticketId}/status`).then(setStatus);
    load();
    const interval = window.setInterval(load, 5000);
    return () => window.clearInterval(interval);
  }, [ticketId]);

  if (!status) return <EmptyState label={t("loadingTicket")} />;

  const trackingUrl = `${window.location.origin}/ticket/${ticketId}`;
  const ticket = status.ticket;

  return (
    <section className="ticket-page">
      <h1 className="sr-only">{t("ticketStatusTitle", { code: ticket.code })}</h1>
      <span>{t("yourTicket")}</span>
      <strong>{ticket.code}</strong>
      <p>{ticket.status} · {localName(status.service, i18n.language)}</p>
      {ticket.source === "APPOINTMENT" ? <p className="appointment-badge">{t("appointment")} · {formatAppointmentTime(ticket.scheduledFor, t)}</p> : null}
      <div className="status-metrics">
        <div>
          <span>{t("position")}</span>
          <strong>{status.position || "-"}</strong>
        </div>
        <div>
          <span>{t("ahead")}</span>
          <strong>{status.numberAhead}</strong>
        </div>
        <div>
          <span>{t("eta")}</span>
          <strong>{status.estimatedWaitMinutes}m</strong>
        </div>
      </div>
      <QrPanel value={trackingUrl} label={t("ticketTrackingLink")} />
      <div className="table-list event-list">
        {ticket.events?.map((event, index) => (
          <div key={`${event.status}-${index}`}>
            <strong>{event.status}</strong>
            <span>{event.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QrPanel({ value, label }: { value: string; label: string }) {
  return (
    <div className="qr-panel">
      <QRCodeSVG value={value} size={150} marginSize={2} title={label} />
      <span>{label}</span>
    </div>
  );
}

function TicketStack({
  tickets,
  services = [],
  onAction,
  onTransfer
}: {
  tickets: TicketRecord[];
  services?: Service[];
  onAction?: (ticketId: string, action: "start" | "complete" | "no-show" | "recall" | "requeue" | "cancel") => Promise<void>;
  onTransfer?: (ticketId: string, serviceId: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  if (tickets.length === 0) return <EmptyState label={t("noTicketsInList")} />;

  return (
    <div className="ticket-stack">
      {tickets.map((ticket) => (
        <div className="ticket-row" key={ticket.id}>
          <strong>{ticket.code}</strong>
          <span>
            {ticket.status} · {ticket.service?.prefix ?? ""}
            {ticket.source === "APPOINTMENT" ? ` · ${t("appointment")} ${formatAppointmentTime(ticket.scheduledFor, t)}` : ""}
          </span>
          {onAction && ticket.status === "CALLED" ? <IconAction label={t("start")} icon={<CheckCircle2 size={16} />} onClick={() => void onAction(ticket.id, "start")} /> : null}
          {onAction && ticket.status === "SERVING" ? <IconAction label={t("complete")} icon={<CheckCircle2 size={16} />} onClick={() => void onAction(ticket.id, "complete")} /> : null}
          {onAction && ticket.status === "CALLED" ? <IconAction label={t("recall")} icon={<RotateCcw size={16} />} onClick={() => void onAction(ticket.id, "recall")} /> : null}
          {onAction && ticket.status === "CALLED" ? <IconAction label={t("noShow")} icon={<XCircle size={16} />} onClick={() => void onAction(ticket.id, "no-show")} /> : null}
          {onAction && ["CALLED", "SERVING"].includes(ticket.status) ? <IconAction label={t("requeue")} icon={<Undo2 size={16} />} onClick={() => void onAction(ticket.id, "requeue")} /> : null}
          {onAction && ["WAITING", "CALLED", "SERVING"].includes(ticket.status) ? <IconAction label={t("cancel")} icon={<XCircle size={16} />} onClick={() => void onAction(ticket.id, "cancel")} /> : null}
          {onTransfer ? (
            <label className="transfer-control">
              <span className="sr-only">{t("transferTicket", { code: ticket.code })}</span>
              <ArrowRightLeft size={16} aria-hidden="true" />
              <select
                aria-label={t("transferTicket", { code: ticket.code })}
                defaultValue=""
                onChange={(event) => {
                  void onTransfer(ticket.id, event.target.value);
                }}
              >
                <option value="" disabled>{t("transfer")}</option>
                {services
                  .filter((service) => service.id !== ticket.service?.id)
                  .map((service) => (
                    <option key={service.id} value={service.id}>{service.prefix}</option>
                  ))}
              </select>
            </label>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function IconAction({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button className="mini-button" onClick={onClick} aria-label={label} title={label}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const titleId = useId();

  return (
    <section className="panel" aria-labelledby={titleId}>
      <div className="panel-title">
        <span aria-hidden="true">{icon}</span>
        <h2 id={titleId}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="empty">{label}</p>;
}

type AppContext = {
  branch: Branch | null;
  user: User | null;
  snapshot: Snapshot;
  setBranch: (branch: Branch | null) => void;
  setUser: (user: User | null) => void;
  refreshSnapshot: (branchId: string) => Promise<void>;
  message: string;
  setMessage: (message: string) => void;
};

async function loadPublicBranch() {
  const slug = window.location.pathname.startsWith("/join/") || window.location.pathname.startsWith("/display/")
    ? window.location.pathname.split("/").at(-1)
    : undefined;
  const path = slug ? `/public/branches/${slug}` : "/public/bootstrap";
  const data = await api<{ branch: Branch | null }>(path);
  return data.branch;
}

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: init?.method ?? "GET",
    cache: "no-store",
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

function localName(value: { nameEn: string; nameAr: string } | null | undefined, language: string) {
  if (!value) return "";
  return language === "ar" ? value.nameAr : value.nameEn;
}

function pageTitle(path: string, t: TFunction) {
  if (path.startsWith("/admin")) return t("admin");
  if (path.startsWith("/staff")) return t("staff");
  if (path.startsWith("/display")) return t("display");
  if (path.startsWith("/ticket/")) return t("ticketStatusPage");
  return t("kiosk");
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function defaultAppointmentInputValue() {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000);
  return localDateTimeInputValue(nextHour);
}

function localDateTimeInputValue(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function formatAppointmentTime(value: string | null | undefined, t: TFunction) {
  if (!value) return t("unscheduled");
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function analyticsQueryString(branchId: string, start: string, end: string) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (branchId) params.set("branchId", branchId);
  return params.toString();
}

createRoot(document.getElementById("root")!).render(<App />);
