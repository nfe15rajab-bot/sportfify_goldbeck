#!/usr/bin/env python3
"""
Stamps a new build string across index.html and data.js.

Every local script and stylesheet is served with ?v=<build>, so a browser
can only pick up changed JavaScript if that string changes. Forgetting to
bump it is silent and convincing: the fix is on disk, the served file is
correct, and the page goes on running yesterday's code. It has already cost
this project an evening once, and caught out a change ten minutes after the
mechanism was added.

So it is a command, not a thing to remember:

    python bump-build.py               # stamps today's date + a counter
    python bump-build.py surfaces      # stamps 2026-09-18-surfaces
"""

import datetime
import io
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).parent


def current_build() -> str:
    text = io.open(ROOT / "data.js", encoding="utf-8").read()
    match = re.search(r'const SPORTIFY_BUILD = "([^"]+)"', text)
    return match.group(1) if match else ""


def next_build(suffix: str | None) -> str:
    today = datetime.date.today().isoformat()
    if suffix:
        return f"{today}-{suffix}"

    # No name given: keep the date unique by counting up, so two bumps in one
    # day still produce two different URLs.
    existing = current_build()
    if existing.startswith(today):
        tail = existing[len(today):].lstrip("-")
        n = int(tail) + 1 if tail.isdigit() else 2
        return f"{today}-{n}"
    return today


def main() -> int:
    old = current_build()
    new = next_build(sys.argv[1] if len(sys.argv) > 1 else None)
    if not old:
        print("Couldn't find SPORTIFY_BUILD in data.js — nothing changed.")
        return 1

    data_path = ROOT / "data.js"
    text = io.open(data_path, encoding="utf-8").read()
    io.open(data_path, "w", encoding="utf-8").write(
        text.replace(f'const SPORTIFY_BUILD = "{old}"', f'const SPORTIFY_BUILD = "{new}"'))

    index_path = ROOT / "index.html"
    html = io.open(index_path, encoding="utf-8").read()
    stamped = html.count(f"?v={old}")
    io.open(index_path, "w", encoding="utf-8").write(html.replace(f"?v={old}", f"?v={new}"))

    print(f"{old}  ->  {new}")
    print(f"  data.js: SPORTIFY_BUILD updated")
    print(f"  index.html: {stamped} script/stylesheet URL(s) restamped")
    print()
    print("Reload the page (and rebuild the add-in if the in-Revit copy matters).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
