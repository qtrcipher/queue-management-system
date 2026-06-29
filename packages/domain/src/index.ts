export const ticketStatuses = [
  "WAITING",
  "CALLED",
  "SERVING",
  "TRANSFERRED",
  "NO_SHOW",
  "COMPLETED",
  "CANCELLED"
] as const;

export type TicketStatus = (typeof ticketStatuses)[number];

export type Locale = "en" | "ar";

export interface QueueTicket {
  id: string;
  code: string;
  status: TicketStatus;
  branchId: string;
  serviceId: string;
  counterId?: string | null;
  issuedAt: string;
  calledAt?: string | null;
  completedAt?: string | null;
}

export interface QueueSnapshot {
  branchId: string;
  waiting: QueueTicket[];
  serving: QueueTicket[];
  called: QueueTicket[];
  updatedAt: string;
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  const allowed: Record<TicketStatus, TicketStatus[]> = {
    WAITING: ["CALLED", "TRANSFERRED", "CANCELLED"],
    CALLED: ["SERVING", "WAITING", "NO_SHOW", "CANCELLED"],
    SERVING: ["COMPLETED", "TRANSFERRED", "CANCELLED"],
    TRANSFERRED: ["WAITING", "CALLED", "CANCELLED"],
    NO_SHOW: ["WAITING", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: []
  };

  return allowed[from].includes(to);
}

export function formatTicketCode(prefix: string, number: number): string {
  return `${prefix.toUpperCase()}-${number.toString().padStart(3, "0")}`;
}

export function estimateWaitMinutes(numberAhead: number, averageServiceMinutes: number, openCounters: number): number {
  if (numberAhead <= 0) return 0;
  const effectiveCounters = Math.max(1, openCounters);
  const estimate = (numberAhead * averageServiceMinutes) / effectiveCounters;
  return Math.max(1, Math.ceil(estimate));
}

