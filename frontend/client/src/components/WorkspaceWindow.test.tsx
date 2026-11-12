import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceWindow } from "./WorkspaceWindow";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspaceWindow — vues de poste", () => {
  it("ouvre le Centre d’ingénierie en espace maître plein écran, même si un ancien layout réduit est mémorisé", () => {
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 1000,
      localStorage: {
        getItem: () => JSON.stringify({
          "engineering-hub": {
            x: 260,
            y: 100,
            width: 780,
            height: 520,
            minimized: false,
            maximized: false,
            zIndex: 2,
          },
        }),
      },
    });

    const markup = renderToStaticMarkup(
      <WorkspaceWindow viewId="engineering-hub" title="AeroMind" onClose={() => undefined}>
        <div>Master workspace</div>
      </WorkspaceWindow>,
    );

    expect(markup).toContain("workspace-window-engineering-hub is-maximized");
    expect(markup).toContain("ESPACE MAÎTRE / POSTE D’INGÉNIERIE");
    expect(markup).toContain("Master workspace");
    expect(markup).not.toContain("left:260px");
  });

  it("restaure toujours le deck mission-center enregistré réduit", () => {
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 1000,
      localStorage: {
        getItem: () => JSON.stringify({
          "mission-center": {
            x: 24,
            y: 24,
            width: 1100,
            height: 720,
            minimized: true,
            maximized: false,
            zIndex: 2,
          },
        }),
      },
    });

    const markup = renderToStaticMarkup(
      <WorkspaceWindow viewId="mission-center" title="Flight command deck" onClose={() => undefined}>
        <div>Flight deck contents</div>
      </WorkspaceWindow>,
    );

    expect(markup).toContain("workspace-window-mission-center is-maximized");
    expect(markup).not.toContain("is-minimized");
    expect(markup).toContain("Flight deck contents");
  });

  it.each([
    ["parametric-center", "Centre Parametric"],
    ["mechanical-center", "Centre Mécanique"],
    ["digital-twin", "Twin"],
    ["mission-center", "Commandement de vol"],
  ])("ouvre %s en grand écran", (viewId, title) => {
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 1000,
      localStorage: { getItem: () => "{}" },
    });

    const markup = renderToStaticMarkup(
      <WorkspaceWindow viewId={viewId} title={title} onClose={() => undefined}>
        <div>Workspace contents</div>
      </WorkspaceWindow>,
    );

    expect(markup).toContain(`workspace-window-${viewId} is-maximized`);
    expect(markup).not.toContain("is-minimized");
  });

  it("positionne une fenêtre flottante après la sidebar sur desktop", () => {
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 1000,
      localStorage: {
        getItem: () => JSON.stringify({
          "command-center": {
            x: 24,
            y: 24,
            width: 1100,
            height: 720,
            minimized: false,
            maximized: false,
            zIndex: 2,
          },
        }),
      },
    });

    const markup = renderToStaticMarkup(
      <WorkspaceWindow viewId="command-center" title="Safe commands" onClose={() => undefined}>
        <div>Commands content</div>
      </WorkspaceWindow>,
    );

    expect(markup).toContain("left:266px");
    expect(markup).toContain("Commands content");
  });

  it.each(["parametric-center", "mechanical-center", "digital-twin", "mission-center", "simulation", "aero-center", "design-studio", "satellite-nav"])(
    "affiche %s comme tableau maître avec les tailles de drone",
    viewId => {
      vi.stubGlobal("window", {
        innerWidth: 1440,
        innerHeight: 1000,
        localStorage: { getItem: () => "{}", setItem: () => undefined },
      });

      const markup = renderToStaticMarkup(
        <WorkspaceWindow viewId={viewId} title="AeroMind" onClose={() => undefined}>
          <div>Master canvas</div>
        </WorkspaceWindow>,
      );

      expect(markup).toContain(`workspace-window-${viewId} is-maximized`);
      expect(markup).toContain("is-master-canvas");
      expect(markup).toContain("Taille d’affichage du drone");
      expect(markup).toContain(">Moyen</button>");
      expect(markup).toContain(">Grand</button>");
      expect(markup).toContain(">Très élargi</button>");
      expect(markup).toContain(">Adaptable</button>");
    },
  );
});
