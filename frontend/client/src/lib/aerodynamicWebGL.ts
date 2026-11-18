import * as THREE from "three";

const contextProfiles: WebGLContextAttributes[] = [
  {
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
  },
  {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference: "default",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
  },
];

export type AerodynamicRenderer = {
  canvas: HTMLCanvasElement;
  context: WebGL2RenderingContext | WebGLRenderingContext;
  renderer: THREE.WebGLRenderer;
};

export function releaseAerodynamicContext(
  context: WebGL2RenderingContext | WebGLRenderingContext | null,
) {
  try {
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Ignore context already destroyed
  }
}

export function createAerodynamicRenderer(
  createCanvas: () => HTMLCanvasElement = () =>
    document.createElement("canvas"),
  createRenderer: (
    options: THREE.WebGLRendererParameters,
  ) => THREE.WebGLRenderer = (options) => new THREE.WebGLRenderer(options),
): AerodynamicRenderer {
  let lastFailure = "Contexte graphique GPU indisponible";
  for (const kind of ["webgl2", "webgl"] as const) {
    for (const profile of contextProfiles) {
      const canvas = createCanvas();
      let context: WebGL2RenderingContext | WebGLRenderingContext | null = null;
      try {
        context = canvas.getContext(kind, profile) as WebGL2RenderingContext | WebGLRenderingContext | null;
        if (!context || context.isContextLost()) continue;
        const renderer = createRenderer({ canvas, context: context as WebGL2RenderingContext, alpha: false });
        canvas.dataset.renderer = kind;
        return { canvas, context, renderer };
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : lastFailure;
        releaseAerodynamicContext(context);
      }
    }
  }
  throw new Error(lastFailure);
}

const disposedResources = new WeakSet<AerodynamicRenderer>();

export function disposeAerodynamicRenderer(resource: AerodynamicRenderer) {
  if (disposedResources.has(resource)) return;
  disposedResources.add(resource);
  try {
    resource.renderer.dispose();
  } finally {
    releaseAerodynamicContext(resource.context);
    resource.canvas.remove();
  }
}

export function createAerodynamicCleanup(finalize: () => void) {
  const tasks: Array<() => void> = [];
  let disposed = false;
  return {
    add(task: () => void) {
      if (disposed) task();
      else tasks.push(task);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const task of tasks.splice(0).reverse()) {
        try {
          task();
        } catch (error) {
          console.warn("AeroMind viewport resource cleanup failed.", error);
        }
      }
      finalize();
    },
  };
}
