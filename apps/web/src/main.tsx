import React, { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, Building2, CheckCircle2, Download, Languages, Mail, Monitor, RotateCcw, Ticket, Trash2, UserRound, UsersRound, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { io } from "socket.io-client";
import "./i18n.js";
import "./styles.css";

type Service = { id: string; nameEn: string; nameAr: string; prefix: string; isActive?: boolean };
type Counter = { id: string; nameEn: string; nameAr: string; isOpen?: boolean };
type Branch = { id: string; slug: string; nameEn: string; nameAr: string; services: Service[]; counters: Counter[] };
type User = { id: string; email: string; name: string; role: string };
type TicketRecord = { id: string; code: string; status: string; service?: Service; counter?: Counter | null; events?: { status: string; note?: string }[] };
type Snapshot = { waiting: TicketRecord[]; called: TicketRecord[]; serving: TicketRecord[]; updatedAt?: string };
type NotificationSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
  ticketEmailSubject: string;
  ticketEmailBody: string;
  ticketSmsTemplate: string;
};
type AdminOverview = { organization: ({ name: string; ticketRetentionDays: number; branches: Branch[]; users: User[] } & NotificationSettings) | null };
type PurgeResult = { deleted: number; cutoff: string; retentionDays: number };
type AnalyticsSummary = {
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
    document.title = `${pageTitle(path)} | QMS`;
  }, [path]);

  async function refreshSnapshot(branchId: string) {
    const data = await api<Snapshot>(`/display/${branchId}`);
    setSnapshot(data);
  }

  const context = { branch, user, snapshot, setBranch, setUser, refreshSnapshot, message, setMessage };

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
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
      <nav aria-label="Primary">
        {navItems.map((item) => (
          <a key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="shell-actions">
        <span>{branchName || t("mainBranch")}</span>
        {user ? <span>{user.name}</span> : null}
        <button className="icon-button" onClick={onLanguage} aria-label="Change language">
          <Languages size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
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
      setError("Login failed. Check the email and password.");
    }
  }

  return (
    <section className="auth-panel">
      <div className="panel-title">
        <UserRound size={18} />
        <h1>Sign in</h1>
      </div>
      <form onSubmit={(event) => void submit(event)} className="form-grid">
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" aria-invalid={Boolean(error)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={Boolean(error)} required />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button">Sign in</button>
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
    setMessage(`Ticket ${ticket.code} created`);
  }

  return (
    <section className="page-grid kiosk-layout">
      <div className="hero-panel">
        <h1>{t("chooseService")}</h1>
        <p>{t("subtitle")}</p>
        <div className="customer-fields">
          <label>
            Name
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" />
          </label>
          <label>
            Email
            <input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            Phone
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
            <QrPanel value={ticketUrl} label="Scan to track your place" />
            <a href={`/ticket/${createdTicket.id}`}>Track ticket</a>
          </>
        ) : (
          <>
            <span>{t("customer")}</span>
            <QrPanel value={joinUrl} label="Scan to join from your phone" />
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

  if (!user) return <LoginPanel onLogin={setUser} />;
  if (!branch) return <EmptyState label="No branch configured." />;

  async function callNext(serviceId: string) {
    if (!branch) return;
    const ticket = await api<TicketRecord | null>(`/staff/${branch.id}/services/${serviceId}/call-next`, {
      method: "POST",
      body: { counterId: branch.counters[0]?.id }
    });
    setMessage(ticket ? `Called ${ticket.code}` : "No waiting tickets");
    await refreshSnapshot(branch.id);
  }

  async function action(ticketId: string, actionName: "start" | "complete" | "no-show" | "recall" | "requeue" | "cancel") {
    if (!branch) return;
    await api<TicketRecord>(`/staff/tickets/${ticketId}/${actionName}`, { method: "POST" });
    setMessage("Ticket updated");
    await refreshSnapshot(branch.id);
  }

  return (
    <section className="page-grid">
      <h1 className="sr-only">{t("staff")}</h1>
      <Panel title={t("staff")} icon={<UsersRound size={18} />}>
        <div className="service-list compact">
          {branch.services.map((service) => (
            <button key={service.id} onClick={() => void callNext(service.id)}>
              {t("callNext")} · {service.prefix} · {localName(service, i18n.language)}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Active tickets" icon={<Ticket size={18} />}>
        <TicketStack tickets={activeTickets} onAction={action} />
      </Panel>
      <Panel title={t("waiting")} icon={<RotateCcw size={18} />}>
        <TicketStack tickets={snapshot.waiting} />
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
            <span>{ticket.counter?.nameEn ?? "Counter"}</span>
          </div>
        ))}
        {activeTickets.length === 0 ? <EmptyState label="No tickets called yet." /> : null}
      </div>
    </section>
  );
}

function AdminPage({ user, setUser, setBranch, setMessage }: AppContext) {
  const { i18n } = useTranslation();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchSlug, setBranchSlug] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [servicePrefix, setServicePrefix] = useState("");
  const [counterName, setCounterName] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("AGENT");
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

  if (!user) return <LoginPanel onLogin={setUser} />;

  const branches = overview?.organization?.branches ?? [];
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? branches[0];

  async function loadAdmin(preferredBranchId?: string) {
    const requestId = loadAdminRequestId.current + 1;
    loadAdminRequestId.current = requestId;
    const [overviewData, analyticsData] = await Promise.all([
      api<AdminOverview>("/admin/bootstrap"),
      api<AnalyticsSummary>("/analytics/summary")
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
    setMessage("Branch created");
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
    setMessage("Service created");
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
    setMessage("Counter created");
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
    setMessage("User created");
    await loadAdmin(selectedBranch?.id);
  }

  async function updateRetention(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const retentionDays = Number(new FormData(form).get("ticketRetentionDays"));
    await api<{ ticketRetentionDays: number }>("/admin/organization/settings", {
      method: "PATCH",
      body: { ticketRetentionDays: retentionDays }
    });
    setTicketRetentionDays(retentionDays);
    setMessage("Retention settings updated");
    await loadAdmin(selectedBranch?.id);
  }

  async function purgeTickets() {
    const result = await api<PurgeResult>("/admin/maintenance/purge-tickets", { method: "POST" });
    setMessage(`${result.deleted} tickets purged`);
    await loadAdmin(selectedBranch?.id);
  }

  async function updateNotifications(event: FormEvent) {
    event.preventDefault();
    await api<NotificationSettings>("/admin/organization/settings", {
      method: "PATCH",
      body: notificationSettings
    });
    setMessage("Notification settings updated");
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

  return (
    <section className="page-grid">
      <h1 className="sr-only">Admin</h1>
      <Panel title="Today" icon={<BarChart3 size={18} />}>
        <div className="metric-grid">
          <Metric label="Issued" value={analytics?.totals.issued ?? 0} />
          <Metric label="Waiting" value={analytics?.totals.waiting ?? 0} />
          <Metric label="Completed" value={analytics?.totals.completed ?? 0} />
          <Metric label="No-show" value={`${analytics?.totals.noShowRate ?? 0}%`} />
          <Metric label="Avg wait" value={`${analytics?.totals.averageWaitMinutes ?? 0}m`} />
          <Metric label="Avg service" value={`${analytics?.totals.averageServiceMinutes ?? 0}m`} />
        </div>
        <a className="download-link" href={`${apiBase}/analytics/tickets.csv`}>
          <Download size={16} />
          Export CSV
        </a>
      </Panel>
      <Panel title="Maintenance" icon={<Trash2 size={18} />}>
        <form onSubmit={(event) => void updateRetention(event)} className="form-grid">
          <label>
            Ticket retention days
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
          <button className="primary-button">Save retention</button>
        </form>
        <button className="danger-button" onClick={() => void purgeTickets()}>
          Purge old terminal tickets
        </button>
      </Panel>
      <Panel title="Notifications" icon={<Mail size={18} />}>
        <form onSubmit={(event) => void updateNotifications(event)} className="form-grid">
          <div className="inline-form notification-server-fields">
            <label>
              SMTP host
              <input value={notificationSettings.smtpHost} onChange={(event) => updateNotificationField("smtpHost", event.target.value)} required />
            </label>
            <label>
              SMTP port
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
            From address
            <input value={notificationSettings.smtpFrom} onChange={(event) => updateNotificationField("smtpFrom", event.target.value)} required />
          </label>
          <label>
            Email subject
            <input value={notificationSettings.ticketEmailSubject} onChange={(event) => updateNotificationField("ticketEmailSubject", event.target.value)} required />
          </label>
          <label>
            Email body
            <textarea rows={4} value={notificationSettings.ticketEmailBody} onChange={(event) => updateNotificationField("ticketEmailBody", event.target.value)} required />
          </label>
          <label>
            SMS template
            <textarea rows={2} value={notificationSettings.ticketSmsTemplate} onChange={(event) => updateNotificationField("ticketSmsTemplate", event.target.value)} required />
          </label>
          <button className="primary-button">Save notifications</button>
        </form>
      </Panel>
      <Panel title="Branches" icon={<Building2 size={18} />}>
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
            Manage branch
            <select value={selectedBranch?.id ?? ""} onChange={(event) => changeManagedBranch(event.target.value)}>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{localName(branch, i18n.language)}</option>
              ))}
            </select>
          </label>
        ) : null}
        <form onSubmit={(event) => void createBranch(event)} className="form-grid">
          <label>Branch name<input value={branchName} onChange={(event) => setBranchName(event.target.value)} required /></label>
          <label>Slug<input value={branchSlug} onChange={(event) => setBranchSlug(event.target.value)} pattern="[a-z0-9-]+" required /></label>
          <button className="primary-button">Add branch</button>
        </form>
      </Panel>
      <Panel title="Services" icon={<Ticket size={18} />}>
        <div className="record-list">
          {selectedBranch?.services.map((service) => (
            <ServiceEditor
              key={service.id}
              service={service}
              issued={analytics?.services.find((row) => row.serviceId === service.id)?.issued ?? 0}
              onSave={async (serviceId, body) => {
                await api<Service>(`/admin/services/${serviceId}`, { method: "PATCH", body });
                setMessage("Service updated");
                await loadAdmin(selectedBranch.id);
              }}
            />
          ))}
        </div>
        <form onSubmit={(event) => void createService(event)} className="form-grid inline-form">
          <label>Name<input value={serviceName} onChange={(event) => setServiceName(event.target.value)} required /></label>
          <label>Prefix<input value={servicePrefix} onChange={(event) => setServicePrefix(event.target.value.toUpperCase())} pattern="[A-Z0-9]{1,4}" required /></label>
          <button className="primary-button">Add service</button>
        </form>
      </Panel>
      <Panel title="Counters" icon={<Monitor size={18} />}>
        <div className="record-list">
          {selectedBranch?.counters.map((counter) => (
            <CounterEditor
              key={counter.id}
              counter={counter}
              onSave={async (counterId, body) => {
                await api<Counter>(`/admin/counters/${counterId}`, { method: "PATCH", body });
                setMessage("Counter updated");
                await loadAdmin(selectedBranch.id);
              }}
            />
          ))}
        </div>
        <form onSubmit={(event) => void createCounter(event)} className="form-grid">
          <label>Counter name<input value={counterName} onChange={(event) => setCounterName(event.target.value)} required /></label>
          <button className="primary-button">Add counter</button>
        </form>
      </Panel>
      <Panel title="Users" icon={<UserRound size={18} />}>
        <div className="record-list">
          {overview?.organization?.users.map((account) => (
            <UserEditor
              key={account.id}
              account={account}
              onSave={async (userId, body) => {
                await api<User>(`/admin/users/${userId}`, { method: "PATCH", body });
                setMessage("User updated");
                await loadAdmin(selectedBranch?.id);
              }}
            />
          ))}
        </div>
        <form onSubmit={(event) => void createUser(event)} className="form-grid">
          <label>Name<input value={userName} onChange={(event) => setUserName(event.target.value)} required /></label>
          <label>Email<input type="email" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} required /></label>
          <label>Password<input type="password" minLength={8} value={userPassword} onChange={(event) => setUserPassword(event.target.value)} required /></label>
          <label>
            Role
            <select value={userRole} onChange={(event) => setUserRole(event.target.value)}>
              <option value="ADMIN">Admin</option>
              <option value="BRANCH_MANAGER">Branch manager</option>
              <option value="AGENT">Agent</option>
              <option value="DISPLAY">Display</option>
            </select>
          </label>
          <button className="primary-button">Add user</button>
        </form>
      </Panel>
    </section>
  );
}

function ServiceEditor({ service, issued, onSave }: { service: Service; issued: number; onSave: (serviceId: string, body: { nameEn: string; nameAr: string; isActive: boolean }) => Promise<void> }) {
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
    <form className="record-row" aria-label={`Edit service ${service.prefix}`} onSubmit={(event) => void submit(event)}>
      <div className="record-meta">
        <strong>{service.prefix}</strong>
        <span>{issued} issued</span>
      </div>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
        Active
      </label>
      <button className="primary-button">Save</button>
    </form>
  );
}

function CounterEditor({ counter, onSave }: { counter: Counter; onSave: (counterId: string, body: { nameEn: string; nameAr: string; isOpen: boolean }) => Promise<void> }) {
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
    <form className="record-row" aria-label={`Edit counter ${counter.nameEn}`} onSubmit={(event) => void submit(event)}>
      <div className="record-meta">
        <strong>{counter.nameEn}</strong>
        <span>{isOpen ? "Open" : "Closed"}</span>
      </div>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={isOpen} onChange={(event) => setIsOpen(event.target.checked)} />
        Open
      </label>
      <button className="primary-button">Save</button>
    </form>
  );
}

function UserEditor({ account, onSave }: { account: User; onSave: (userId: string, body: { name: string; role: string; password?: string }) => Promise<void> }) {
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
    <form className="record-row user-record-row" aria-label={`Edit user ${account.email}`} onSubmit={(event) => void submit(event)}>
      <div className="record-meta">
        <strong>{account.email}</strong>
        <span>{account.role}</span>
      </div>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
      </label>
      <label>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="OWNER">Owner</option>
          <option value="ADMIN">Admin</option>
          <option value="BRANCH_MANAGER">Branch manager</option>
          <option value="AGENT">Agent</option>
          <option value="DISPLAY">Display</option>
        </select>
      </label>
      <label>
        New password
        <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leave blank to keep" />
      </label>
      <button className="primary-button">Save</button>
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
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<TicketStatusView | null>(null);

  useEffect(() => {
    const load = () => void api<TicketStatusView>(`/tickets/${ticketId}/status`).then(setStatus);
    load();
    const interval = window.setInterval(load, 5000);
    return () => window.clearInterval(interval);
  }, [ticketId]);

  if (!status) return <EmptyState label="Loading ticket..." />;

  const trackingUrl = `${window.location.origin}/ticket/${ticketId}`;
  const ticket = status.ticket;

  return (
    <section className="ticket-page">
      <h1 className="sr-only">Ticket {ticket.code} status</h1>
      <span>Your ticket</span>
      <strong>{ticket.code}</strong>
      <p>{ticket.status} · {localName(status.service, i18n.language)}</p>
      <div className="status-metrics">
        <div>
          <span>Position</span>
          <strong>{status.position || "-"}</strong>
        </div>
        <div>
          <span>Ahead</span>
          <strong>{status.numberAhead}</strong>
        </div>
        <div>
          <span>ETA</span>
          <strong>{status.estimatedWaitMinutes}m</strong>
        </div>
      </div>
      <QrPanel value={trackingUrl} label="Ticket tracking link" />
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

function TicketStack({ tickets, onAction }: { tickets: TicketRecord[]; onAction?: (ticketId: string, action: "start" | "complete" | "no-show" | "recall" | "requeue" | "cancel") => Promise<void> }) {
  if (tickets.length === 0) return <EmptyState label="No tickets in this list." />;

  return (
    <div className="ticket-stack">
      {tickets.map((ticket) => (
        <div className="ticket-row" key={ticket.id}>
          <strong>{ticket.code}</strong>
          <span>{ticket.status}</span>
          {onAction && ticket.status === "CALLED" ? <IconAction label="Start" icon={<CheckCircle2 size={16} />} onClick={() => void onAction(ticket.id, "start")} /> : null}
          {onAction && ticket.status === "SERVING" ? <IconAction label="Complete" icon={<CheckCircle2 size={16} />} onClick={() => void onAction(ticket.id, "complete")} /> : null}
          {onAction && ticket.status === "CALLED" ? <IconAction label="Recall" icon={<RotateCcw size={16} />} onClick={() => void onAction(ticket.id, "recall")} /> : null}
          {onAction && ticket.status === "CALLED" ? <IconAction label="No-show" icon={<XCircle size={16} />} onClick={() => void onAction(ticket.id, "no-show")} /> : null}
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

function pageTitle(path: string) {
  if (path.startsWith("/admin")) return "Admin";
  if (path.startsWith("/staff")) return "Staff";
  if (path.startsWith("/display")) return "Display";
  if (path.startsWith("/ticket/")) return "Ticket status";
  return "Kiosk";
}

createRoot(document.getElementById("root")!).render(<App />);
