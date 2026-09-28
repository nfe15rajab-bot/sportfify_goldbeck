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
    # newline="\n": the repository is LF (.gitattributes); Python's text mode would write CRLF on Windows and make the whole file a diff
    io.open(data_path, "w", encoding="utf-8", newline="\n").write(
        text.replace(f'const SPORTIFY_BUILD = "{old}"', f'const SPORTIFY_BUILD = "{new}"'))

    index_path = ROOT / "index.html"
    html = io.open(index_path, encoding="utf-8").read()

    # EVERY ?v=, not only the ones carrying the previous build.
    #
    # This used to be html.replace(f"?v={old}", ...), which restamps a URL only
    # if it already holds the exact previous stamp. A file added with a
    # hand-typed stamp that did not match therefore missed that run — and every
    # run after it, because it was never equal to `old` again. It froze.
    #
    # Five files had frozen this way (components.js, footballCourt.js,
    # activityFamilies.js, pingPongTable.js, climbingTower.js): edits to them
    # shipped, but any browser holding the old URL kept serving its cache, so
    # the code on screen was not the code in the repository. That is the exact
    # failure this script exists to prevent.
    before = set(re.findall(r'\?v=([^"\']+)', html))
    html_new, stamped = re.subn(r'\?v=[^"\']+', f"?v={new}", html)
    io.open(index_path, "w", encoding="utf-8", newline="\n").write(html_new)

    print(f"{old}  ->  {new}")
    print(f"  data.js: SPORTIFY_BUILD updated")
    print(f"  index.html: {stamped} script/stylesheet URL(s) restamped")
    stale = sorted(v for v in before if v not in (old, new))
    if stale:
        print(f"  (also caught {len(stale)} URL(s) left on other stamp(s): {', '.join(stale)})")
    print()
    print("Reload the page (and rebuild the add-in if the in-Revit copy matters).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
