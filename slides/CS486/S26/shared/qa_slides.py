#!/usr/bin/env python3
"""Capture and validate every reveal.js slide and coherent fragment state.

Example:
    python slides/CS486/S26/shared/qa_slides.py L23

The repo must already be served over HTTP and Chrome must expose CDP. A typical
local setup is:
    python -m http.server 8765 --directory .
    chrome --headless=new --remote-debugging-port=9223 about:blank
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import time
from pathlib import Path
from typing import Any

import requests
import websockets
from PIL import Image, ImageDraw


class CDP:
    def __init__(self, websocket_url: str):
        self.websocket_url = websocket_url
        self.websocket = None
        self.next_id = 1
        self.events: list[dict[str, Any]] = []

    async def __aenter__(self):
        self.websocket = await websockets.connect(
            self.websocket_url,
            origin="http://localhost",
            max_size=32 * 1024 * 1024,
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("lecture", help="Lecture directory name, e.g. L23")
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--cdp-http", default="http://127.0.0.1:9223")
    parser.add_argument("--out", type=Path)
    parser.add_argument(
        "--static-demos",
        action="store_true",
        help="Use the PDF/static-demo query mode.",
    )
    return parser.parse_args()


def wait_for_target(cdp_http: str, timeout=15) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            targets = requests.get(f"{cdp_http}/json", timeout=1).json()
            pages = [target for target in targets if target.get("type") == "page"]
            if pages:
                return pages[0]["webSocketDebuggerUrl"]
        except (requests.RequestException, ValueError):
            pass
        time.sleep(0.2)
    raise TimeoutError(f"Chrome CDP target did not appear at {cdp_http}")


async def wait_for_reveal(cdp: CDP, timeout=30) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        ready = await cdp.evaluate(
            "typeof Reveal !== 'undefined' && Reveal.isReady && Reveal.isReady()"
        )
        if ready:
            await cdp.evaluate(
                """Promise.all([
                  document.fonts ? document.fonts.ready : Promise.resolve(),
                  ...[...document.images].map((image) => image.complete
                    ? Promise.resolve()
                    : new Promise((resolve) => {
                        image.addEventListener('load', resolve, {once:true});
                        image.addEventListener('error', resolve, {once:true});
                      }))
                ])"""
            )
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
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, nodes]) => ({
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
  const badImages = [...slide.querySelectorAll('img')].filter((image) =>
    !image.hasAttribute('alt') || !image.alt.trim()
  ).map((image) => image.getAttribute('src'));
  const unnamedControls = [...slide.querySelectorAll('button,input,textarea,select')].filter((node) => {
    if (node.type === 'hidden') return false;
    const labelled = node.getAttribute('aria-label') ||
      node.getAttribute('aria-labelledby') ||
      (node.labels && node.labels.length) ||
      String(node.textContent || '').trim() ||
      node.getAttribute('title');
    return !labelled;
  }).map((node) => ({
    tag: node.tagName,
    type: node.getAttribute('type'),
    cls: String(node.className || '').slice(0, 100),
  }));
  return {
    title: String((slide.querySelector('h2,.course-title') || {}).textContent || '')
      .trim().replace(/\\s+/g, ' '),
    slideRect: {
      left: Math.round(sr.left), right: Math.round(sr.right),
      top: Math.round(sr.top), bottom: Math.round(sr.bottom),
    },
    scrollWidth: slide.scrollWidth,
    clientWidth: slide.clientWidth,
    scrollHeight: slide.scrollHeight,
    clientHeight: slide.clientHeight,
    offenders: offenders.slice(0, 16),
    badImages,
    unnamedControls,
  };
})()
"""


async def screenshot(cdp: CDP, path: Path) -> None:
    result = await cdp.call(
        "Page.captureScreenshot",
        {"format": "png", "captureBeyondViewport": False, "fromSurface": True},
    )
    path.write_bytes(base64.b64decode(result["data"]))


def contact_sheets(paths: list[Path], prefix: str, output: Path) -> None:
    thumb_size = (320, 180)
    font = ImageDraw.Draw(Image.new("RGB", (1, 1))).getfont()
    for start in range(0, len(paths), 12):
        batch = paths[start : start + 12]
        sheet = Image.new("RGB", (1280, 570), "white")
        draw = ImageDraw.Draw(sheet)
        for position, path in enumerate(batch):
            row, column = divmod(position, 4)
            with Image.open(path) as source:
                image = source.convert("RGB")
                image.thumbnail(thumb_size)
            x, y = column * 320, row * 190
            sheet.paste(image, (x, y))
            label = path.stem
            label_width = max(42, 10 + len(label) * 7)
            draw.rectangle((x, y, x + label_width, y + 18), fill="white")
            draw.text((x + 4, y + 3), label, fill="black", font=font)
        sheet.save(
            output / f"{prefix}-{start + 1:02d}-{start + len(batch):02d}.jpg",
            quality=90,
        )


def event_text(event: dict[str, Any]) -> str:
    params = event.get("params", {})
    if "entry" in params:
        return str(params["entry"].get("text", ""))
    details = params.get("exceptionDetails", {})
    if details:
        return str(details.get("text", ""))
    args = params.get("args", [])
    return " ".join(str(argument.get("value", "")) for argument in args)


async def run(args: argparse.Namespace) -> None:
    lecture = args.lecture.upper()
    output = args.out or Path(f"/tmp/{lecture.lower()}-qa")
    for state in ("initial", "full", "steps"):
        (output / state).mkdir(parents=True, exist_ok=True)

    query = "static-demos=1&qa=1" if args.static_demos else "qa=1"
    url = (
        f"{args.base_url.rstrip('/')}/slides/CS486/S26/{lecture}/"
        f"?{query}"
    )
    websocket_url = wait_for_target(args.cdp_http)
    report: dict[str, Any] = {
        "lecture": lecture,
        "url": url,
        "staticDemos": args.static_demos,
        "slides": [],
        "console": [],
    }

    async with CDP(websocket_url) as cdp:
        await cdp.call("Page.enable")
        await cdp.call("Runtime.enable")
        await cdp.call("Log.enable")
        await cdp.call("Log.clear")
        await cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": 1280,
                "height": 720,
                "deviceScaleFactor": 1,
                "mobile": False,
            },
        )
        await cdp.call("Page.navigate", {"url": url})
        await wait_for_reveal(cdp)
        await asyncio.sleep(1)
        total = await cdp.evaluate(
            "document.querySelectorAll('.slides > section').length"
        )

        for index in range(total):
            item: dict[str, Any] = {"index": index + 1}
            for full, state in ((False, "initial"), (True, "full")):
                await cdp.evaluate(STATE_JS % (index, str(full).lower()))
                await asyncio.sleep(0.12)
                item[state] = await cdp.evaluate(METRICS_JS)
                await screenshot(cdp, output / state / f"{index + 1:02d}.png")

            await cdp.evaluate(STATE_JS % (index, "false"))
            groups = await cdp.evaluate(FRAGMENT_GROUPS_JS)
            item["fragmentGroups"] = groups
            for group in groups:
                step = group["index"]
                await cdp.evaluate(STEP_STATE_JS % (index, step))
                await asyncio.sleep(0.1)
                await screenshot(
                    cdp,
                    output / "steps" / f"{index + 1:02d}-{step:02d}.png",
                )
            report["slides"].append(item)
            print(f"captured {index + 1:02d}/{total}: {item['full']['title']}")

        for event in cdp.events:
            method = event.get("method", "")
            if method in {
                "Runtime.exceptionThrown",
                "Runtime.consoleAPICalled",
                "Log.entryAdded",
            }:
                report["console"].append(
                    {"method": method, "text": event_text(event)}
                )

    (output / "report.json").write_text(json.dumps(report, indent=2))
    contact_sheets(sorted((output / "initial").glob("*.png")), "initial", output)
    contact_sheets(sorted((output / "full").glob("*.png")), "full", output)
    contact_sheets(sorted((output / "steps").glob("*.png")), "steps", output)

    fragment_issues = [
        {
            "slide": slide["index"],
            "group": group["index"],
            "issues": group["issues"],
        }
        for slide in report["slides"]
        for group in slide["fragmentGroups"]
        if group["issues"]
    ]
    layout_issues = [
        {
            "slide": slide["index"],
            "state": state,
            "title": slide[state]["title"],
            "offenders": slide[state]["offenders"],
            "badImages": slide[state]["badImages"],
            "unnamedControls": slide[state]["unnamedControls"],
        }
        for slide in report["slides"]
        for state in ("initial", "full")
        if (
            slide[state]["offenders"]
            or slide[state]["badImages"]
            or slide[state]["unnamedControls"]
            or slide[state]["scrollWidth"] > slide[state]["clientWidth"] + 3
            or slide[state]["scrollHeight"] > slide[state]["clientHeight"] + 3
        )
    ]
    console_errors = [
        event
        for event in report["console"]
        if event["method"] != "Runtime.consoleAPICalled"
        or any(word in event["text"].lower() for word in ("error", "exception"))
    ]

    summary = {
        "slides": len(report["slides"]),
        "fragmentIssues": fragment_issues,
        "layoutOrAccessibilityIssues": layout_issues,
        "consoleErrors": console_errors,
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2))
    if fragment_issues or layout_issues or console_errors:
        raise RuntimeError(
            "Slide QA failed:\n" + json.dumps(summary, indent=2)
        )
    print(f"QA passed; report and contact sheets written to {output}")


def main() -> None:
    asyncio.run(run(parse_args()))


if __name__ == "__main__":
    main()
