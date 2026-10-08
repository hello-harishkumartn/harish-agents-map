#!/usr/bin/env python3
"""Merge an update file into status.json for the Harish Agents Map.

Usage:
    python3 tools/update_status.py --input tools/sample_input.json --output status.json [--base status.json] [--max-feed 200]

Python 3 standard library only.

Steps:
  1. Load the base status (default ./status.json). If it does not exist, start
     from an empty skeleton.
  2. Apply the input file (format below).
  3. Write --output with generated_at = now in IST (+05:30), unless the input
     provides "generated_at".

Input format (JSON object; every key is optional):

{
  "generated_at": "2026-10-08T15:10:00+05:30",
  "agents": [
    {"id": "crypto-chart-watch", "status": "working",
     "last_action": "...", "last_run": "...", "next_run": "...",
     "role": "...", "name": "...", "desk": "..."}
  ],
  "routines": [
    {"agent": "harish-pa", "name": "Mudrex multi-strategy watch",
     "schedule": "...", "last_run": "...", "last_result": "...", "next_run": "..."}
  ],
  "feed": [
    {"time": "2026-10-08T15:08:00+05:30", "agent": "harish-pa",
     "text": "...", "kind": "info"}
  ],
  "replace_feed": false
}

Rules:
  * agents   - upsert by "id"; only the given fields are merged. A new agent
               needs at least "name" and "desk" (role defaults to "").
  * routines - upsert by (agent, name) into that agent's "routines" list.
  * feed     - appended, de-duplicated by (time, agent, text), sorted newest
               first, capped at --max-feed (default 200). With
               "replace_feed": true the existing feed is discarded first.
  * status   - one of working|idle|error|scheduled|never. An idle agent whose
               next_run is within 30 min keeps "idle"; the web UI shows it as
               "scheduled" automatically.
  * kind     - one of trade|notice|report|journal|reminder|events|info|error.
  * times    - ISO 8601 strings with an offset (e.g. +05:30) or null.

Exits non-zero with a clear message on invalid input.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
STATUSES = {"working", "idle", "error", "scheduled", "never"}
KINDS = {"trade", "notice", "report", "journal", "reminder", "events", "info", "error"}
AGENT_FIELDS = {"id", "name", "desk", "role", "status", "last_action", "last_run", "next_run", "routines"}
ROUTINE_FIELDS = {"name", "schedule", "last_run", "last_result", "next_run"}
TIME_FIELDS = ("last_run", "next_run")


class InputError(Exception):
    pass


def parse_time(value, where):
    """Validate an ISO time (or None); returns an aware datetime or None."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise InputError(f"{where}: expected ISO time string or null, got {value!r}")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise InputError(f"{where}: not a valid ISO 8601 time: {value!r}")
    if dt.tzinfo is None:
        raise InputError(f"{where}: time must include an offset like +05:30: {value!r}")
    return dt


def load_json(path, label):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        raise InputError(f"{label} file not found: {path}")
    except json.JSONDecodeError as exc:
        raise InputError(f"{label} file {path} is not valid JSON: {exc}")


def skeleton():
    return {"generated_at": None, "timezone": "Asia/Calcutta (IST)", "desks": [], "agents": [], "feed": []}


def apply_agents(status, items):
    if not isinstance(items, list):
        raise InputError('"agents" must be a list')
    by_id = {a["id"]: a for a in status["agents"]}
    desk_ids = {d["id"] for d in status["desks"]}
    for i, item in enumerate(items):
        where = f"agents[{i}]"
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]:
            raise InputError(f'{where}: each agent needs a non-empty string "id"')
        unknown = set(item) - AGENT_FIELDS
        if unknown:
            raise InputError(f"{where}: unknown field(s) {sorted(unknown)}")
        if "status" in item and item["status"] not in STATUSES:
            raise InputError(f"{where}: status must be one of {sorted(STATUSES)}, got {item['status']!r}")
        for f in TIME_FIELDS:
            if f in item:
                parse_time(item[f], f"{where}.{f}")
        agent = by_id.get(item["id"])
        if agent is None:
            if not item.get("name") or not item.get("desk"):
                raise InputError(f'{where}: new agent {item["id"]!r} needs "name" and "desk"')
            agent = {"id": item["id"], "name": item["name"], "desk": item["desk"], "role": "",
                     "status": "idle", "last_action": None, "last_run": None, "next_run": None, "routines": []}
            status["agents"].append(agent)
            by_id[agent["id"]] = agent
        for key, value in item.items():
            if key == "routines":
                continue  # use the top-level "routines" list for routine upserts
            agent[key] = value
        if agent["desk"] not in desk_ids:
            print(f"warning: agent {agent['id']!r} uses undeclared desk {agent['desk']!r}; "
                  "the map will create a fallback desk for it", file=sys.stderr)
    return by_id


def apply_routines(by_id, items):
    if not isinstance(items, list):
        raise InputError('"routines" must be a list')
    for i, item in enumerate(items):
        where = f"routines[{i}]"
        if not isinstance(item, dict):
            raise InputError(f"{where}: must be an object")
        agent_id, name = item.get("agent"), item.get("name")
        if agent_id not in by_id:
            raise InputError(f"{where}: unknown agent {agent_id!r}")
        if not isinstance(name, str) or not name:
            raise InputError(f'{where}: needs a non-empty "name"')
        unknown = set(item) - ROUTINE_FIELDS - {"agent"}
        if unknown:
            raise InputError(f"{where}: unknown field(s) {sorted(unknown)}")
        for f in TIME_FIELDS:
            if f in item:
                parse_time(item[f], f"{where}.{f}")
        routines = by_id[agent_id].setdefault("routines", [])
        existing = next((r for r in routines if r.get("name") == name), None)
        if existing is None:
            existing = {"name": name, "schedule": "", "last_run": None, "last_result": "", "next_run": None}
            routines.append(existing)
        for key in ROUTINE_FIELDS:
            if key in item:
                existing[key] = item[key]


def apply_feed(status, items, replace, max_feed, agent_ids):
    if not isinstance(items, list):
        raise InputError('"feed" must be a list')
    clean = []
    for i, item in enumerate(items):
        where = f"feed[{i}]"
        if not isinstance(item, dict):
            raise InputError(f"{where}: must be an object")
        for key in ("time", "agent", "text", "kind"):
            if not isinstance(item.get(key), str) or not item[key]:
                raise InputError(f'{where}: needs a non-empty string "{key}"')
        if item["kind"] not in KINDS:
            raise InputError(f"{where}: kind must be one of {sorted(KINDS)}, got {item['kind']!r}")
        if item["agent"] not in agent_ids:
            raise InputError(f"{where}: unknown agent {item['agent']!r}")
        parse_time(item["time"], f"{where}.time")
        clean.append({k: item[k] for k in ("time", "agent", "text", "kind")})

    feed = [] if replace else list(status.get("feed", []))
    seen, merged = set(), []
    for entry in feed + clean:
        key = (entry.get("time"), entry.get("agent"), entry.get("text"))
        if key in seen:
            continue
        seen.add(key)
        merged.append(entry)

    def sort_key(entry):
        try:
            return parse_time(entry.get("time"), "feed").timestamp()
        except InputError:
            return float("-inf")

    merged.sort(key=sort_key, reverse=True)
    status["feed"] = merged[:max_feed]


def update(status, data, max_feed):
    if not isinstance(data, dict):
        raise InputError("input must be a JSON object")
    unknown = set(data) - {"generated_at", "agents", "routines", "feed", "replace_feed"}
    if unknown:
        raise InputError(f"input: unknown top-level key(s) {sorted(unknown)}")
    if not isinstance(data.get("replace_feed", False), bool):
        raise InputError('"replace_feed" must be true or false')

    for key, default in skeleton().items():
        status.setdefault(key, default)
    by_id = apply_agents(status, data.get("agents", []))
    apply_routines(by_id, data.get("routines", []))
    if "feed" in data or data.get("replace_feed"):
        apply_feed(status, data.get("feed", []), data.get("replace_feed", False), max_feed, set(by_id))

    if data.get("generated_at"):
        parse_time(data["generated_at"], "generated_at")
        status["generated_at"] = data["generated_at"]
    else:
        status["generated_at"] = datetime.now(IST).replace(microsecond=0).isoformat()
    return status


def dump_status(status):
    """Readable but compact JSON: one line per desk, simple agent, routine and feed entry."""
    one = lambda o: json.dumps(o, ensure_ascii=False)
    lines = ["{"]
    keys = list(status)
    for i, key in enumerate(keys):
        end = "," if i < len(keys) - 1 else ""
        value = status[key]
        if key in ("desks", "feed") and isinstance(value, list):
            body = ",\n".join("  " + one(x) for x in value)
            lines.append(f' "{key}": [\n{body}\n ]{end}' if value else f' "{key}": []{end}')
        elif key == "agents" and isinstance(value, list):
            agents = []
            for a in value:
                if not a.get("routines"):
                    agents.append("  " + one(a))
                    continue
                fields = []
                for k, v in a.items():
                    if k == "routines" and v:
                        rs = ",\n".join("    " + one(r) for r in v)
                        fields.append(f'   "routines": [\n{rs}\n   ]')
                    else:
                        fields.append(f"   {one(k)}: {one(v)}")
                agents.append("  {\n" + ",\n".join(fields) + "\n  }")
            lines.append(f' "agents": [\n' + ",\n".join(agents) + f"\n ]{end}")
        else:
            lines.append(f" {one(key)}: {one(value)}{end}")
    return "\n".join(lines) + "\n}\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description="Merge an update into status.json for the Harish Agents Map.")
    ap.add_argument("--input", required=True, help="update JSON file (see module docstring)")
    ap.add_argument("--output", required=True, help="where to write the merged status.json")
    ap.add_argument("--base", default="status.json", help="existing status.json to start from (default: ./status.json)")
    ap.add_argument("--max-feed", type=int, default=200, help="maximum feed entries to keep (default: 200)")
    args = ap.parse_args(argv)

    try:
        if args.max_feed < 1:
            raise InputError("--max-feed must be at least 1")
        status = load_json(args.base, "base") if os.path.exists(args.base) else skeleton()
        if not isinstance(status, dict) or not isinstance(status.get("agents", []), list):
            raise InputError(f"base file {args.base} is not a valid status object")
        data = load_json(args.input, "input")
        status = update(status, data, args.max_feed)
    except InputError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    tmp = args.output + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(dump_status(status))
    os.replace(tmp, args.output)
    print(f"wrote {args.output}: {len(status['agents'])} agents, {len(status['feed'])} feed items, "
          f"generated_at {status['generated_at']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
