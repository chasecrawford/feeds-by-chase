#!/usr/bin/env python3
"""
feed-checker.py — Hourly Bluesky feed quality check via local LLM.

Fetches recent posts from each configured feed, sends unseen posts to
Ollama for classification, and fires a Discord webhook for any that the
LLM considers off-topic. Run via systemd timer (feed-checker.timer).
"""

import json
import os
import sys
import requests
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

PUBLISHER_DID  = os.environ["FEEDGEN_PUBLISHER_DID"]
DISCORD_WEBHOOK = os.environ["DISCORD_WEBHOOK_URL"]
OLLAMA_URL     = os.environ.get("OLLAMA_URL", "http://192.168.86.33:11434")
OLLAMA_MODEL   = os.environ.get("OLLAMA_MODEL", "qwen3:8b")

BSKY_API   = "https://public.api.bsky.app/xrpc"
STATE_FILE = Path(__file__).parent.parent / "feed-checker-state.json"
MAX_SEEN   = 500  # URIs remembered per feed to avoid re-alerting

FEEDS = [
    {
        "shortname": "uofl-football",
        "rkey":      "aaaps4w6ssniy",
        "name":      "Louisville Football",
        "topic": (
            "University of Louisville Cardinals college football (NCAA). "
            "Posts must be about UofL football — games, players, coaches, "
            "recruiting, stats, or fan commentary. Not about soccer, the NFL, "
            "other teams unless they are directly playing Louisville, or "
            "unrelated subjects."
        ),
    },
    {
        "shortname": "uofl-basketball",
        "rkey":      "aaalxyswlqxco",
        "name":      "Louisville Basketball",
        "topic": (
            "University of Louisville Cardinals college basketball (NCAA), "
            "both men's and women's teams. Posts must be about UofL basketball "
            "— games, players, coaches Pat Kelsey or Jeff Walz, recruiting, "
            "stats, or fan commentary. Not about other teams unless they are "
            "playing Louisville."
        ),
    },
    {
        "shortname": "alien-earth",
        "rkey":      "aaaf2gyhpeav6",
        "name":      "Alien: Earth",
        "topic": (
            "The Alien: Earth TV show on Hulu. Posts must be commentary, "
            "reactions, analysis, or discussion about the show, its characters "
            "(Wendy, Boy Kavalier, Kirsh, etc.), or the broader Alien franchise. "
            "Not about unrelated TV shows, movies, or topics."
        ),
    },
]

# ── State ─────────────────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {f["shortname"]: [] for f in FEEDS}

def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ── Bluesky ───────────────────────────────────────────────────────────────────

def feed_uri(rkey: str) -> str:
    return f"at://{PUBLISHER_DID}/app.bsky.feed.generator/{rkey}"

def fetch_feed(rkey: str, limit: int = 40) -> list:
    r = requests.get(
        f"{BSKY_API}/app.bsky.feed.getFeed",
        params={"feed": feed_uri(rkey), "limit": limit},
        timeout=15,
    )
    r.raise_for_status()
    return r.json().get("feed", [])

def extract_text(item: dict) -> str:
    record = item.get("post", {}).get("record", {})
    parts = [record.get("text", "")]
    ext = record.get("embed", {}).get("external", {})
    if ext.get("title"):
        parts.append(ext["title"])
    if ext.get("description"):
        parts.append(ext["description"][:500])
    return "\n".join(p for p in parts if p).strip()

def post_url(item: dict) -> str:
    post   = item.get("post", {})
    handle = post.get("author", {}).get("handle", "")
    rkey   = post.get("uri", "").split("/")[-1]
    return f"https://bsky.app/profile/{handle}/post/{rkey}"

# ── LLM ───────────────────────────────────────────────────────────────────────

PROMPT = """/no_think You are a feed quality checker for a Bluesky social media feed.

Feed topic: {topic}

Post text (may include link card title and description):
---
{text}
---

Does this post genuinely belong in this feed? Consider the actual subject matter, not just surface keyword overlap.
Respond with valid JSON only — no markdown, no extra text:
{{"belongs": true, "reason": "one concise sentence"}}"""

def classify(text: str, topic: str) -> dict:
    try:
        r = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model":  OLLAMA_MODEL,
                "prompt": PROMPT.format(topic=topic, text=text[:1500]),
                "stream": False,
                "format": "json",
            },
            timeout=45,
        )
        r.raise_for_status()
        return json.loads(r.json().get("response", "{}"))
    except Exception as e:
        print(f"  [llm error] {e}", file=sys.stderr)
        return {"belongs": True, "reason": f"checker error — skipped: {e}"}

# ── Discord ───────────────────────────────────────────────────────────────────

def send_discord(flagged: list) -> None:
    embeds = []
    for f in flagged:
        embeds.append({
            "title": f"⚠️ Off-topic in {f['feed_name']}",
            "url":   f["url"],
            "description": f"[@{f['handle']}]({f['profile_url']})\n\n{f['text'][:400]}",
            "fields": [{"name": "Why flagged", "value": f["reason"], "inline": False}],
            "color": 0xFF4444,
        })
    # Discord allows max 10 embeds per message
    for i in range(0, len(embeds), 10):
        requests.post(
            DISCORD_WEBHOOK,
            json={"username": "Feed Checker 🔍", "embeds": embeds[i:i+10]},
            timeout=10,
        ).raise_for_status()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    state   = load_state()
    flagged = []

    for feed in FEEDS:
        sn   = feed["shortname"]
        seen = set(state.get(sn, []))
        print(f"[{sn}] fetching...", flush=True)

        try:
            items = fetch_feed(feed["rkey"])
        except Exception as e:
            print(f"[{sn}] fetch error: {e}", file=sys.stderr)
            continue

        new_items = [(item.get("post", {}).get("uri", ""), item)
                     for item in items
                     if item.get("post", {}).get("uri", "") not in seen]

        print(f"[{sn}] {len(new_items)} new post(s) to classify", flush=True)

        for uri, item in new_items:
            if not uri:
                continue
            text   = extract_text(item)
            seen.add(uri)
            if not text:
                continue

            result = classify(text, feed["topic"])
            handle = item.get("post", {}).get("author", {}).get("handle", "unknown")

            if not result.get("belongs", True):
                reason = result.get("reason", "no reason given")
                print(f"  FLAGGED @{handle}: {reason}", flush=True)
                flagged.append({
                    "feed_name":   feed["name"],
                    "handle":      handle,
                    "profile_url": f"https://bsky.app/profile/{handle}",
                    "url":         post_url(item),
                    "text":        text,
                    "reason":      reason,
                })
            else:
                print(f"  ok @{handle}", flush=True)

        # Trim seen list to avoid unbounded growth
        state[sn] = list(seen)[-MAX_SEEN:]

    save_state(state)

    if flagged:
        print(f"\nAlerting Discord: {len(flagged)} flagged post(s)", flush=True)
        send_discord(flagged)
    else:
        print("\nAll clear.", flush=True)

if __name__ == "__main__":
    main()
