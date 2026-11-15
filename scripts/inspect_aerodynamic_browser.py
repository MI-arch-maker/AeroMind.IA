"""Read-only browser inspection of the user's AeroMind interface.

Requires playwright and a Chromium executable. Does not authenticate a user,
write remote records, generate CFD data, or enable hardware outputs.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:3000/?view=aero-cfd")
    parser.add_argument("--output", default="/tmp/aeromind-browser-inspection")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
            args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(args.url, wait_until="domcontentloaded")
        page.wait_for_timeout(4500)
        page.screenshot(path=str(output / "interface.png"), full_page=False)
        info = page.evaluate("""() => ({
          title: document.title,
          text: document.body.innerText,
          buttons: Array.from(document.querySelectorAll('button')).map(b => ({text:b.innerText,disabled:b.disabled})),
          canvases: Array.from(document.querySelectorAll('canvas')).map(c => ({
             renderer:c.dataset.renderer,frames:c.dataset.renderedFrames,width:c.width,height:c.height
          }))
        })""")
        info["pageErrors"] = errors
        info["url"] = page.url
        info["engine"] = "Chromium headless, ANGLE SwiftShader (software WebGL2)"
        (output / "inspection.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"url":page.url,"title":info["title"],"canvases":info["canvases"],"pageErrors":errors,"bodyStart":info["text"][:3500]}, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
