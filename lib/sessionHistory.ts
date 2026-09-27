const STORAGE_KEY = "boa-session-history";

export type SessionRecord = {
  id: string;
  scenarioTitle: string;
  scenarioId: string;
  date: string; // ISO timestamp
  playerCount: number;
  teamScore: number;
  avgIndividual: number;
  synergy: number;
};

export function loadSessionHistory(): SessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveSessionRecord(record: SessionRecord): SessionRecord[] {
  const existing = loadSessionHistory();
  const next = [...existing, record];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearSessionHistory(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
