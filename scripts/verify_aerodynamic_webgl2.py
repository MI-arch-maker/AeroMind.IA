"""AeroMind aerodynamic browser regression checks, isolated local browser only.

No account login, server mutation, CFD generation or hardware command. Uses a
geometry already supplied in the user's archive. Test scenarios are confined
to a disposable browser context and never shipped as application data.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:3000/?view=aero-cfd")
    parser.add_argument("--output", default="/tmp/aeromind-webgl2-evidence")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    evidence = {"engine": "Chromium headless / ANGLE SwiftShader; software WebGL2", "url": args.url, "checks": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
            args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        context = browser.new_context(viewport={"width": 1600, "height": 1100})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        shader_errors = []
        page.on("console", lambda message: shader_errors.append(message.text) if message.type == "error" and any(term in message.text for term in ["THREE.WebGLProgram", "Shader Error", "VALIDATE_STATUS"]) else None)
        page.goto(args.url, wait_until="domcontentloaded")
        page.locator(".aero-cfd-center").wait_for(timeout=30000)
        page.wait_for_timeout(1200)
        center = page.locator(".aero-cfd-center")
        assert center.locator(".aero-demo-warning").count() == 0, "Demonstration values still visible"
        evidence["checks"].append("No demonstration banner or fabricated aerodynamic result")
        page.locator('.aero-cfd-nav button[title="Simulation Setup"]').click()
        assert all(value == "" for value in center.locator('input[type="number"]').evaluate_all("els => els.map(e=>e.value)")), "Numeric defaults must be empty"
        evidence["checks"].append("All initial aerodynamic numeric inputs empty")
        page.locator('.aero-cfd-nav button[title="3D Model Importer"]').click()
        geometry = root / "frontend/client/public/assets/aeromind-cell-library/01-aile-delta-noire.obj"
        center.locator('input[type="file"]').set_input_files(str(geometry))
        page.wait_for_function("""() => {
            const c=document.querySelector('.aero-viewport canvas[data-renderer="webgl2"]');
            return c && Number(c.dataset.renderedFrames)>2 && document.querySelector('#aero-render-style');
        }""", timeout=30000)
        evidence["geometry"] = geometry.name
        evidence["webgl"] = center.locator('canvas[data-renderer="webgl2"]').evaluate("""c => {
          const gl=c.getContext('webgl2');
          return {version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER),frames:Number(c.dataset.renderedFrames),lost:gl.isContextLost()};
        }""")
        assert "WebGL 2.0" in evidence["webgl"]["version"]
        assert not evidence["webgl"]["lost"]
        evidence["checks"].append("Supplied OBJ decoded and rendered by an actual WebGL 2 context")
        original_dimensions = center.locator('.aero-asset-card dd').nth(5).inner_text()
        page.locator('.aero-cfd-nav button[title="Settings"]').click()
        center.locator('select').select_option("cm")
        page.locator('.aero-cfd-nav button[title="3D Model Importer"]').click()
        page.wait_for_function("() => Number(document.querySelector('.aero-viewport canvas')?.dataset.renderedFrames)>1", timeout=15000)
        assert "cm" in center.locator('.aero-asset-card dd').nth(2).inner_text()
        assert center.locator('.aero-asset-card dd').nth(5).inner_text() != original_dimensions
        evidence["checks"].append("Settings unit change updates imported dimensions and their provenance")
        for preset in ["axonometric", "orthographic", "perspective", "npr", "clay", "lowpoly", "archviz", "mechanical", "bionic", "carbon", "cyberpunk", "crystal"]:
            center.locator('#aero-render-style').select_option(preset)
            page.wait_for_timeout(90)
            assert center.locator('.aero-viewport-shell').get_attribute('data-render-preset') == preset
        evidence["checks"].append("All twelve supported material/projection presets selectable")
        center.locator('#aero-render-style').select_option("mechanical")
        center.locator('canvas[data-renderer="webgl2"]').scroll_into_view_if_needed()
        canvas = center.locator('canvas[data-renderer="webgl2"]')
        bounds = canvas.bounding_box()
        assert bounds is not None, "Viewport not visible"
        x, y = bounds['x']+bounds['width']/2, bounds['y']+bounds['height']/2
        page.mouse.move(x,y)
        page.mouse.down()
        page.mouse.move(x+40,y+20,steps=6)
        page.mouse.up()
        page.mouse.wheel(0,80)
        page.wait_for_timeout(250)
        evidence["checks"].append("Orbit and wheel zoom execute without JavaScript error")
        canvas.evaluate("c => {c.dataset.previousContext='yes'; c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();}")
        page.wait_for_function("""() => {
          const c=document.querySelector('.aero-viewport canvas[data-renderer="webgl2"]');
          return c && !c.dataset.previousContext && Number(c.dataset.renderedFrames)>2;
        }""", timeout=20000)
        evidence["checks"].append("Automatic recovery after forced GPU context loss")
        for _ in range(4):
            page.locator('.aero-cfd-nav button[title="Aerodynamic Dashboard"]').click()
            page.wait_for_function("() => Number(document.querySelector('.aero-viewport canvas')?.dataset.renderedFrames)>0", timeout=15000)
            page.locator('.aero-cfd-nav button[title="3D Model Importer"]').click()
            page.wait_for_function("() => Number(document.querySelector('.aero-viewport canvas')?.dataset.renderedFrames)>0", timeout=15000)
        evidence["checks"].append("Eight viewport remounts without context-budget exhaustion")
        page.set_viewport_size({"width":1024,"height":900})
        page.wait_for_timeout(400)
        assert center.locator('canvas[data-renderer="webgl2"]').evaluate("c=>c.width>0 && c.height>0")
        evidence["checks"].append("Viewport remains valid after resize to 1024 pixels")
        page.set_viewport_size({"width":1600,"height":1100})
        page.screenshot(path=str(output / "webgl2-import.png"))
        assert not errors, errors
        assert not shader_errors, shader_errors
        evidence["pageErrors"] = errors
        evidence["shaderErrors"] = shader_errors
        partial = browser.new_context(viewport={"width":1200,"height":900})
        partial.add_init_script("""(() => {
          const original=ResizeObserver.prototype.observe;
          let injected=false;
          ResizeObserver.prototype.observe=function(target,...args) {
            if (!injected && target.classList.contains('aero-viewport')) {
              injected=true; throw new Error('Injected partial viewport initialization failure');
            }
            return original.call(this,target,...args);
          };
        })();""")
        interrupted = partial.new_page()
        interrupted.goto(args.url, wait_until="domcontentloaded")
        interrupted.locator('.aero-viewport-error').wait_for(timeout=30000)
        interrupted.locator('.aero-viewport-error button').click()
        interrupted.wait_for_function("() => Number(document.querySelector('.aero-viewport canvas')?.dataset.renderedFrames)>1", timeout=20000)
        evidence["checks"].append("Injected partial initialization failure cleaned up; retry renders without a leaked slot")
        partial.close()
        blocked = browser.new_context(viewport={"width":1200,"height":900})
        blocked.add_init_script("""(() => {
          const original=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(type,...args) {
            return type==='webgl2' ? null : original.call(this,type,...args);
          };
        })();""")
        fallback = blocked.new_page()
        fallback.goto(args.url, wait_until="domcontentloaded")
        fallback.locator('.aero-viewport-error').wait_for(timeout=30000)
        assert fallback.locator('.aero-viewport-error button').is_visible()
        assert fallback.locator('.aero-viewport canvas').count() == 0
        evidence["checks"].append("Explicit unavailable-WebGL2 error and retry; no false 2D fallback")
        blocked.close()
        context.close()
        browser.close()
    (output / "webgl2-validation.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2),encoding="utf-8")
    print(json.dumps(evidence,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
