import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalVirtualControlState, type VirtualControlResponse } from "../lib/hardwareControl";

const hookHarness = vi.hoisted(() => ({
  index: 0,
  state: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  initial: {} as Record<number, unknown>,
  reset(initial: Record<number, unknown> = {}) {
    this.index = 0;
    this.state = [];
    this.refs = [];
    this.initial = initial;
  },
}));

// Un petit harnais de hooks suffit ici : les interactions sont les callbacks React du vrai panneau,
// sans DOM ni dépendance de test supplémentaire.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hookHarness.index++;
      if (!(index in hookHarness.state)) {
        hookHarness.state[index] = index in hookHarness.initial
          ? hookHarness.initial[index]
          : typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      return [hookHarness.state[index], (next: unknown) => {
        hookHarness.state[index] = typeof next === "function"
          ? (next as (old: unknown) => unknown)(hookHarness.state[index])
          : next;
      }];
    },
    useRef: (initial: unknown) => {
      const index = hookHarness.index++;
      hookHarness.refs[index] ??= { current: initial };
      return hookHarness.refs[index];
    },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: () => undefined,
  };
});

import { HardwareControlPanel } from "./HardwareControlPanel";

type UiNode = { type: unknown; props: Record<string, unknown> };

function loadedState(overrides: Partial<ReturnType<typeof createLocalVirtualControlState>> = {}) {
  return { ...createLocalVirtualControlState(), revision: 7, ...overrides };
}

function renderPanel(overrides: Record<number, unknown> = {}) {
  hookHarness.reset({
    0: true, // serveur disponible
    1: "server",
    5: loadedState(),
    11: true, // état serveur chargé
    ...overrides,
  });
  return HardwareControlPanel() as unknown as UiNode;
}

function rerenderPanel(overrides: Record<number, unknown> = {}) {
  for (const [index, value] of Object.entries(overrides)) hookHarness.state[Number(index)] = value;
  hookHarness.index = 0;
  return HardwareControlPanel() as unknown as UiNode;
}

function walk(node: unknown): UiNode[] {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (node === null || typeof node !== "object") return [];
  const current = node as UiNode;
  return [current, ...walk(current.props?.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return text((node as UiNode).props?.children);
}

function click(root: UiNode, label: string) {
  const button = walk(root).find(node => node.type === "button" && text(node.props.children).includes(label));
  if (!button) throw new Error(`Bouton introuvable : ${label}`);
  (button.props.onClick as () => void)();
}

function check(root: UiNode, label: string) {
  const control = walk(root).find(node => node.type === "label"
    && text(node.props.children).includes(label));
  if (!control) throw new Error(`Confirmation introuvable : ${label}`);
  const input = walk(control).find(node => node.type === "input" && node.props.type === "checkbox");
  if (!input) throw new Error(`Case introuvable : ${label}`);
  (input.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
}

function response(overrides: Partial<VirtualControlResponse> = {}): VirtualControlResponse {
  return {
    ...loadedState(),
    revision: 8,
    physical_output: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 409, json: async () => body };
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllGlobals();
  hookHarness.reset();
});

describe("HardwareControlPanel · UI VIRTUAL sans matériel", () => {
  it("envoie un identifiant neuf et la révision courante pour activer, armer, appliquer un setpoint et revenir en SIMULATION", async () => {
    const states = [
      response({ mode: "VIRTUAL", revision: 8, virtual_active: true }),
      response({ mode: "VIRTUAL", revision: 9, virtual_active: true, armed: true }),
      response({ mode: "VIRTUAL", revision: 10, virtual_active: true, armed: true }),
      response({ mode: "SIMULATION", revision: 11, virtual_active: false, armed: false }),
    ];
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit): Promise<unknown> => jsonResponse(states.shift()));
    vi.stubGlobal("fetch", fetchMock);

    let ui = renderPanel({ 5: loadedState({ revision: 7 }) });
    check(ui, "Intention d’activer");
    ui = rerenderPanel();
    check(ui, "Setpoint vérifié");
    ui = rerenderPanel();
    click(ui, "Activer VIRTUAL");
    await settle();

    ui = rerenderPanel();
    check(ui, "Intention d’activer");
    ui = rerenderPanel();
    check(ui, "Setpoint vérifié");
    ui = rerenderPanel();
    click(ui, "Armer VIRTUAL");
    await settle();

    ui = rerenderPanel();
    check(ui, "Setpoint courant confirmé");
    ui = rerenderPanel();
    click(ui, "Appliquer position VIRTUAL");
    await settle();

    ui = rerenderPanel();
    click(ui, "Revenir en SIMULATION");
    await settle();

    const calls = fetchMock.mock.calls.map(([path, init]) => ({ path, init: init as RequestInit }));
    expect(calls.map(call => call.path)).toEqual([
      "/api/control/mode", "/api/control/arm", "/api/control/command", "/api/control/mode",
    ]);
    const payloads = calls.map(({ init }) => JSON.parse(String(init.body)) as Record<string, unknown>);
    expect(payloads.map(payload => payload.expected_revision)).toEqual([7, 8, 9, 10]);
    expect(payloads.every(payload => typeof payload.action_id === "string" && payload.action_id.length > 0)).toBe(true);
    expect(new Set(payloads.map(payload => payload.action_id)).size).toBe(payloads.length);
    expect(payloads[0]).toMatchObject({ mode: "VIRTUAL", confirm_operator: true, confirm_safety: true });
    expect(payloads[1]).toMatchObject({ mode: "VIRTUAL", confirm_operator: true, confirm_safety: true });
    expect(payloads[2]).toMatchObject({ command: "position", x_m: 0, y_m: 0, altitude_m: 20, confirm_command: true });
    expect(payloads[3]).toMatchObject({ mode: "SIMULATION", confirm_operator: false, confirm_safety: false });
    expect(calls.every(({ path }) => String(path).startsWith("/api/control/"))).toBe(true);
  });

  it("refuse une mutation avant le chargement de l’état serveur", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const confirmed = renderPanel({ 2: true, 3: true, 11: false });
    click(confirmed, "Activer VIRTUAL");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hookHarness.state[9]).toContain("non chargé");
  });

  it("ne présente pas de succès et ne relance pas une réponse qui autorise une sortie physique", async () => {
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit): Promise<unknown> =>
      jsonResponse({ ...response({ mode: "VIRTUAL", virtual_active: true }), physical_output: true }));
    vi.stubGlobal("fetch", fetchMock);
    const ui = renderPanel({ 2: true, 3: true });
    click(ui, "Activer VIRTUAL");
    await settle();
    const resultUi = rerenderPanel();
    expect(text(resultUi)).toContain("Activation VIRTUAL non confirmée");
    expect(text(resultUi)).not.toContain("VIRTUAL activé et journalisé");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/control/mode");
  });

  it("sérialise les mutations concurrentes et ignore la réponse d’activation devenue tardive après l’arrêt d’urgence", async () => {
    let resolveActivation!: (result: unknown) => void;
    const firstResponse = new Promise(resolve => { resolveActivation = resolve; });
    const fetchMock = vi.fn((_path: RequestInfo | URL, _init?: RequestInit): Promise<unknown> => Promise.resolve(null))
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(jsonResponse(response({ mode: "SIMULATION", revision: 9, stopped: true, disarmed: true, queue_purged: 0 })));
    vi.stubGlobal("fetch", fetchMock);

    let ui = renderPanel();
    check(ui, "Intention d’activer");
    ui = rerenderPanel();
    check(ui, "Setpoint vérifié");
    ui = rerenderPanel();
    const activationClick = walk(ui).find(node => node.type === "button" && text(node.props.children).includes("Activer VIRTUAL"))?.props.onClick as () => void;
    activationClick();
    activationClick(); // callback conservé exprès : le verrou ref doit aussi protéger les événements en double.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    ui = rerenderPanel();
    click(ui, "Arrêt d’urgence");
    await settle();
    resolveActivation(jsonResponse(response({ mode: "VIRTUAL", revision: 8, virtual_active: true })));
    await settle();

    const finalUi = rerenderPanel();
    expect(text(finalUi)).toContain("peut déjà avoir été traitée par le serveur");
    expect(text(finalUi)).toContain("activation : non");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(([path, init]) => ({ path, init: init as RequestInit }));
    expect(requests.map(request => request.path)).toEqual(["/api/control/mode", "/api/control/emergency-stop"]);
    const emergencyPayload = JSON.parse(String(requests[1].init.body));
    expect(emergencyPayload.expected_revision).toBe(7);
    expect(emergencyPayload.action_id).toEqual(expect.any(String));
  });
});
