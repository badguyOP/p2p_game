import { Dims, Scenario } from "./scenarios";

const STORAGE_KEY = "boa-custom-scenarios";

export function defaultDims(): Dims {
  return { speed: 0.4, stabilize: 0.4, resource: 0.4, strategy: 0.4, risk: 0.4 };
}

export function loadCustomScenarios(): Scenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomScenario(scenario: Scenario): Scenario[] {
  const existing = loadCustomScenarios();
  const next = [...existing.filter((s) => s.id !== scenario.id), scenario];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteCustomScenario(id: string): Scenario[] {
  const existing = loadCustomScenarios();
  const next = existing.filter((s) => s.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
