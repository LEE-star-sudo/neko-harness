---
name: skill-finder
description: Discover and suggest installable skills from the neko skill market. Use when the user asks "how do I do X", "is there a skill for X", "find a skill that can...", or expresses interest in extending the agent's capabilities — especially for specialized domains like documents, frontend, testing, or workflow automation.
---

# Skill Finder

Help the user discover skills from the neko skill market. You search and present; the user installs.

## When to use

- The user asks "how do I do X" where X might be a common task with an existing skill
- The user says "find a skill for X", "is there a skill for X", "can you do X" where X is a specialized capability
- The user expresses interest in extending your capabilities or mentions a recurring workflow

## How to search

The market has a read-only JSON API that needs no credentials. Search it with bash:

```bash
curl -s "<market-url>/api/skills?q=<query>"
```

Each result has `name`, `description`, `category`, `metadata.source`, `version`, and `size_bytes`. Try a couple of keyword variants if the first query misses (e.g. "pdf", then "document").

The default market URL is `https://skill.kirineko.tech`. If the user has configured a different one (`skills.marketUrl` in `neko.config.json`), use that instead.

## Presenting candidates

Present matches compactly: name, one-line description, category and source. Example:

```
I found a couple of skills that might help:

- **pdf** (documents · Anthropic) — read, extract, merge, and manipulate PDF files
- **read** (research · Tw93/Waza) — fetch URLs and PDFs into clean Markdown

To install one, open the skill market: the market page in the Web UI, or `/skills` in the TUI.
```

## The install boundary

Do not download or install skills yourself — no fetching the zip, no writing into skills directories. Installation belongs to the user through the market interface, which shows install status, previews, and overwrite confirmations. Your job ends at a good recommendation plus pointing at the entry point.

If neither market interface is available in this environment, say so and give the user the exact skill name to install later.

## When nothing matches

1. Say that no existing skill matched.
2. Offer to help with the task directly with your general capabilities.
3. If it looks like a recurring need, suggest creating one — the `skill-creator` skill walks through that.
