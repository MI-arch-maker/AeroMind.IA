import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceWindow } from "./WorkspaceWindow";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspaceWindow — vues de poste", () => {
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
});
