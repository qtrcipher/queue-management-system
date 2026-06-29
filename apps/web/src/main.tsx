import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle2, Languages, Monitor, Ticket, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { io } from "socket.io-client";
import "./i18n.js";
import "./styles.css";

type Service = { id: string; nameEn: string; nameAr: string; prefix: string };
type Counter = { id: string; nameEn: string; nameAr: string };
type Branch = { id: string; slug: string; nameEn: string; nameAr: string; services: Service[]; counters: Counter[] };
type TicketRecord = { id: string; code: string; status: string; service?: Service; counter?: Counter | null };
type Snapshot = { waiting: TicketRecord[]; called: TicketRecord[]; serving: TicketRecord[] };

const apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

function App() {
  const { i18n, t } = useTranslation();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({ waiting: [], called: [], serving: [] });
  const [createdTicket, setCreatedTicket] = useState<TicketRecord | null>(null);
  const dir = i18n.language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = dir;
  }, [dir, i18n.language]);

  useEffect(() => {
    void fetch(`${apiBase}/admin/bootstrap`)
      .then((response) => response.json())
      .then((data: { branch: Branch | null }) => {
        setBranch(data.branch);
        if (data.branch) return fetch(`${apiBase}/display/${data.branch.id}`).then((response) => response.json());
        return null;
      })
      .then((data: Snapshot | null) => {
        if (data) setSnapshot(data);
      });
  }, []);

  useEffect(() => {
    const socket = io(apiBase, { withCredentials: true });
    const refresh = () => {
      if (!branch) return;
      void fetch(`${apiBase}/display/${branch.id}`)
        .then((response) => response.json())
        .then(setSnapshot);
    };

    socket.on("ticket.created", refresh);
    socket.on("ticket.called", refresh);
    socket.on("ticket.updated", refresh);
    return () => {
      socket.disconnect();
    };
  }, [branch]);

  const services = branch?.services ?? [];
  const counters = branch?.counters ?? [];
  const localizedBranch = i18n.language === "ar" ? branch?.nameAr : branch?.nameEn;

  async function createTicket(serviceId: string) {
    if (!branch) return;
    const response = await fetch(`${apiBase}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId: branch.id, serviceId })
    });
    const ticket = (await response.json()) as TicketRecord;
    setCreatedTicket(ticket);
  }

  async function callNext(serviceId: string) {
    if (!branch) return;
    const counterId = counters[0]?.id;
    const response = await fetch(`${apiBase}/staff/${branch.id}/services/${serviceId}/call-next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterId })
    });
    const ticket = (await response.json()) as TicketRecord | null;
    if (ticket) await refreshSnapshot(branch.id);
  }

  async function updateTicket(ticketId: string, action: "start" | "complete" | "no-show") {
    await fetch(`${apiBase}/staff/tickets/${ticketId}/${action}`, { method: "POST" });
    if (branch) await refreshSnapshot(branch.id);
  }

  async function refreshSnapshot(branchId: string) {
    const data = (await fetch(`${apiBase}/display/${branchId}`).then((response) => response.json())) as Snapshot;
    setSnapshot(data);
  }

  const activeTickets = useMemo(() => [...snapshot.called, ...snapshot.serving], [snapshot.called, snapshot.serving]);

  return (
    <main>
      <header className="app-header">
        <div>
          <h1>{t("appName")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <button className="icon-button" onClick={() => void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")} aria-label="Change language">
          <Languages size={20} />
        </button>
      </header>

      <section className="status-band">
        <div>
          <span>{localizedBranch ?? t("mainBranch")}</span>
          <strong>{snapshot.waiting.length}</strong>
          <small>{t("waiting")}</small>
        </div>
        <div>
          <span>{t("called")}</span>
          <strong>{snapshot.called.length}</strong>
          <small>{t("serving")}: {snapshot.serving.length}</small>
        </div>
      </section>

      <div className="workspace">
        <Panel title={t("kiosk")} icon={<Ticket size={18} />}>
          <h3>{t("chooseService")}</h3>
          <div className="service-list">
            {services.map((service) => (
              <button key={service.id} onClick={() => void createTicket(service.id)}>
                <strong>{i18n.language === "ar" ? service.nameAr : service.nameEn}</strong>
                <span>{service.prefix}</span>
              </button>
            ))}
          </div>
          {createdTicket ? (
            <div className="ticket-slip">
              <span>{t("yourTicket")}</span>
              <strong>{createdTicket.code}</strong>
            </div>
          ) : null}
        </Panel>

        <Panel title={t("staff")} icon={<UsersRound size={18} />}>
          <div className="service-list compact">
            {services.map((service) => (
              <button key={service.id} onClick={() => void callNext(service.id)}>
                {t("callNext")} · {service.prefix}
              </button>
            ))}
          </div>
          <div className="ticket-stack">
            {activeTickets.map((ticket) => (
              <div className="ticket-row" key={ticket.id}>
                <strong>{ticket.code}</strong>
                <span>{ticket.status}</span>
                {ticket.status === "CALLED" ? <button onClick={() => void updateTicket(ticket.id, "start")}>{t("start")}</button> : null}
                {ticket.status === "SERVING" ? <button onClick={() => void updateTicket(ticket.id, "complete")}>{t("complete")}</button> : null}
                {ticket.status === "CALLED" ? <button onClick={() => void updateTicket(ticket.id, "no-show")}>{t("noShow")}</button> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("display")} icon={<Monitor size={18} />}>
          <div className="display-board">
            {[...snapshot.called, ...snapshot.serving].slice(0, 6).map((ticket) => (
              <div className="display-ticket" key={ticket.id}>
                <strong>{ticket.code}</strong>
                <span>{ticket.counter?.nameEn ?? counters[0]?.nameEn ?? "Counter"}</span>
              </div>
            ))}
            {activeTickets.length === 0 ? <p className="empty">No tickets called yet.</p> : null}
          </div>
        </Panel>

        <Panel title={t("admin")} icon={<CheckCircle2 size={18} />}>
          <div className="admin-grid">
            <div><strong>{services.length}</strong><span>Services</span></div>
            <div><strong>{counters.length}</strong><span>Counters</span></div>
            <div><strong>{snapshot.waiting.length}</strong><span>Waiting</span></div>
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

