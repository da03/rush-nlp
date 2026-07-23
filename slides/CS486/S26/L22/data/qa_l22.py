"""Capture every L22 slide and every coherent fragment step via CDP."""

import asyncio
import base64
import json
import time
from pathlib import Path

import requests
import websockets
from PIL import Image, ImageDraw


CDP_HTTP = "http://127.0.0.1:9223"
URL = "http://127.0.0.1:8765/slides/CS486/S26/L22/"
OUT = Path("/tmp/l22-qa")


class CDP:
    def __init__(self, websocket_url: str):
        self.websocket_url = websocket_url
        self.websocket = None
        self.next_id = 1
        self.events = []

    async def __aenter__(self):
        self.websocket = await websockets.connect(
            self.websocket_url, origin="http://localhost", max_size=32 * 1024 * 1024
        )
        return self

    async def __aexit__(self, *_):
        await self.websocket.close()

    async def call(self, method: str, params=None):
        ident = self.next_id
        self.next_id += 1
        await self.websocket.send(
            json.dumps({"id": ident, "method": method, "params": params or {}})
        )
        while True:
            message = json.loads(await self.websocket.recv())
            if message.get("id") == ident:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})
            self.events.append(message)

    async def evaluate(self, expression: str):
        result = await self.call(
            "Runtime.evaluate",
            {
                "expression": expression,
                "awaitPromise": True,
                "returnByValue": True,
            },
        )
        return result["result"].get("value")


def wait_for_target(timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            targets = requests.get(f"{CDP_HTTP}/json", timeout=1).json()
            pages = [target for target in targets if target.get("type") == "page"]
            if pages:
                return pages[0]["webSocketDebuggerUrl"]
        except requests.RequestException:
            pass
        time.sleep(0.2)
    raise TimeoutError("Chrome CDP target did not appear")


async def wait_for_reveal(cdp: CDP, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        ready = await cdp.evaluate(
            "typeof Reveal !== 'undefined' && Reveal.isReady && Reveal.isReady()"
        )
        if ready:
            return
        await asyncio.sleep(0.2)
    raise TimeoutError("Reveal.js did not become ready")


STATE_JS = """
((index, full) => {
  Reveal.slide(index, 0, -1);
  const slide = Reveal.getCurrentSlide();
  const fragments = [...slide.querySelectorAll('.fragment')];
  for (const node of fragments) {
    node.classList.toggle('visible', full);
    node.classList.remove('current-fragment');
  }
  if (full && fragments.length) fragments.at(-1).classList.add('current-fragment');
  Reveal.layout();
  return { index, fragments: fragments.length };
})(%d, %s)
"""

STEP_STATE_JS = """
((index, step) => {
  Reveal.slide(index, 0, -1);
  const slide = Reveal.getCurrentSlide();
  const fragments = [...slide.querySelectorAll('.fragment')];
  for (const node of fragments) {
    const nodeStep = Number(node.dataset.fragmentIndex);
    node.classList.toggle('visible', nodeStep <= step);
    node.classList.toggle('current-fragment', nodeStep === step);
  }
  Reveal.layout();
  return { index, step };
})(%d, %d)
"""

FRAGMENT_GROUPS_JS = """
(() => {
  const slide = Reveal.getCurrentSlide();
  const groups = new Map();
  for (const node of slide.querySelectorAll('.fragment')) {
    const index = Number(node.dataset.fragmentIndex);
    if (!groups.has(index)) groups.set(index, []);
    const text = String(node.textContent || '').trim().replace(/\\s+/g, ' ');
    const cls = String(node.getAttribute('class') || '');
    groups.get(index).push({
      tag: node.tagName.toLowerCase(),
      cls,
      text: text.slice(0, 120),
      connector: /(?:^|\\s)(?:arrow|plus|times)(?:\\s|$)/.test(cls) ||
        /^[→←↑↓+×]+$/.test(text),
      svgPrimitive: /^(?:line|path|polygon|polyline|rect|text)$/.test(
        node.tagName.toLowerCase()
      ),
    });
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([index, nodes]) => ({
    index,
    nodes,
    issues: [
      ...(nodes.some((node) => node.svgPrimitive)
        ? ['SVG shape or label is fragmented separately from its visual unit']
        : []),
      ...(nodes.some((node) => node.connector) && nodes.every((node) => node.connector)
        ? ['connector is a click by itself']
        : []),
    ],
  }));
})()
"""

METRICS_JS = """
(() => {
  const slide = Reveal.getCurrentSlide();
  const sr = slide.getBoundingClientRect();
  const visible = [...slide.querySelectorAll('*')].filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0 && rect.width > 1 && rect.height > 1;
  });
  const offenders = visible.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      tag: node.tagName,
      cls: String(node.className || '').slice(0, 100),
      text: String(node.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
    };
  }).filter((item) =>
    item.left < sr.left - 3 || item.right > sr.right + 3 ||
    item.top < sr.top - 3 || item.bottom > sr.bottom + 3
  );
  return {
    title: (slide.querySelector('h2,.course-title') || {}).textContent || '',
    slideRect: {
      left: Math.round(sr.left), right: Math.round(sr.right),
      top: Math.round(sr.top), bottom: Math.round(sr.bottom),
    },
    scrollWidth: slide.scrollWidth,
    clientWidth: slide.clientWidth,
    scrollHeight: slide.scrollHeight,
    clientHeight: slide.clientHeight,
    offenders: offenders.slice(0, 12),
  };
})()
"""


async def screenshot(cdp: CDP, path: Path):
    result = await cdp.call(
        "Page.captureScreenshot",
        {"format": "png", "captureBeyondViewport": False, "fromSurface": True},
    )
    path.write_bytes(base64.b64decode(result["data"]))


def contact_sheets(paths, prefix):
    thumb_size = (320, 180)
    font = ImageDraw.Draw(Image.new("RGB", (1, 1))).getfont()
    for start in range(0, len(paths), 12):
        batch = paths[start : start + 12]
        sheet = Image.new("RGB", (1280, 570), "white")
        draw = ImageDraw.Draw(sheet)
        for j, path in enumerate(batch):
            row, col = divmod(j, 4)
            image = Image.open(path).convert("RGB")
            image.thumbnail(thumb_size)
            x, y = col * 320, row * 190
            sheet.paste(image, (x, y))
            label = path.stem
            label_width = max(42, 10 + len(label) * 7)
            draw.rectangle((x, y, x + label_width, y + 18), fill="white")
            draw.text((x + 4, y + 3), label, fill="black", font=font)
        sheet.save(OUT / f"{prefix}-{start + 1:02d}-{start + len(batch):02d}.jpg", quality=90)


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for state in ("initial", "full", "steps"):
        (OUT / state).mkdir(exist_ok=True)

    websocket_url = wait_for_target()
    report = {"slides": [], "console": []}
    async with CDP(websocket_url) as cdp:
        await cdp.call("Page.enable")
        await cdp.call("Runtime.enable")
        await cdp.call("Log.enable")
        await cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": 1280,
                "height": 720,
                "deviceScaleFactor": 1,
                "mobile": False,
            },
        )
        await cdp.call("Page.navigate", {"url": URL})
        await wait_for_reveal(cdp)
        await asyncio.sleep(2)
        total = await cdp.evaluate(
            "document.querySelectorAll('.slides > section').length"
        )

        for index in range(total):
            item = {"index": index + 1}
            for full, state in ((False, "initial"), (True, "full")):
                await cdp.evaluate(STATE_JS % (index, str(full).lower()))
                await asyncio.sleep(0.22)
                item[state] = await cdp.evaluate(METRICS_JS)
                await screenshot(cdp, OUT / state / f"{index + 1:02d}.png")

            await cdp.evaluate(STATE_JS % (index, "false"))
            groups = await cdp.evaluate(FRAGMENT_GROUPS_JS)
            item["fragmentGroups"] = groups
            for group in groups:
                step = group["index"]
                await cdp.evaluate(STEP_STATE_JS % (index, step))
                await asyncio.sleep(0.22)
                await screenshot(
                    cdp, OUT / "steps" / f"{index + 1:02d}-{step:02d}.png"
                )
            report["slides"].append(item)
            print(f"captured {index + 1:02d}/{total}")

        for event in cdp.events:
            method = event.get("method", "")
            if method in {
                "Runtime.exceptionThrown",
                "Runtime.consoleAPICalled",
                "Log.entryAdded",
            }:
                report["console"].append(event)

    (OUT / "report.json").write_text(json.dumps(report, indent=2))
    contact_sheets(sorted((OUT / "initial").glob("*.png")), "initial")
    contact_sheets(sorted((OUT / "full").glob("*.png")), "full")
    contact_sheets(sorted((OUT / "steps").glob("*.png")), "steps")

    fragment_issues = [
        {"slide": slide["index"], "group": group["index"], "issues": group["issues"]}
        for slide in report["slides"]
        for group in slide["fragmentGroups"]
        if group["issues"]
    ]
    if fragment_issues:
        raise RuntimeError(
            "Incoherent fragment groups detected:\n"
            + json.dumps(fragment_issues, indent=2)
        )
    print(f"Wrote report and contact sheets to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
