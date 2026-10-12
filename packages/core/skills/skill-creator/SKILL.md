---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance, or optimize a skill's description for better triggering accuracy.
---

<!--
  Adapted from anthropics/skills `skill-creator` (Apache-2.0, see LICENSE.txt in this directory).
  Trimmed for neko-harness: removed Claude.ai / Cowork platform sections, the subagent-based
  parallel eval machinery, the eval-viewer server scripts, blind comparison, and
  package_skill.py / present_files packaging. The test loop is adapted to neko mechanics:
  project-level skill directories, `/skill:<name>` explicit invocation, and fresh sessions.
  Update via a dedicated change when refreshing from upstream.
-->

# Skill Creator

A skill for creating new skills and iteratively improving them.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run them with the skill active
- Help the user evaluate the results, qualitatively and (where outputs are objectively checkable) quantitatively
- Rewrite the skill based on feedback
- Repeat until you're satisfied
- Expand the test set and try again at larger scale

Your job when using this skill is to figure out where the user is in this process and then jump in and help them progress through these stages. Maybe they're like "I want to make a skill for X" — help narrow down what they mean, write a draft, write the test cases, figure out how they want to evaluate, and repeat. Or maybe they already have a draft — go straight to the test/iterate part of the loop.

Of course, be flexible: if the user is like "I don't need to run a bunch of evaluations, just vibe with me", do that instead.

After the skill is done (order is flexible), you can also optimize the description for better triggering — there's a dedicated section below.

## Communicating with the user

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. Pay attention to context cues to understand how to phrase your communication. In the default case:

- "evaluation" and "benchmark" are borderline, but OK
- for "JSON" and "assertion" you want to see serious cues from the user that they know what those things are before using them without explaining them

It's OK to briefly explain terms if you're in doubt.

---

## Skills in neko

Where skills live and how they load, because this shapes how you test:

- **Locations**: `~/.agents/skills/<name>/` (user level, every workspace) and `<workspace>/.agents/skills/<name>/` (project level, this workspace only). Same-named project skills override user-level ones.
- **SKILL.md format**: YAML frontmatter + Markdown body. `description` is required (max ~1000 characters); `name` is optional and falls back to the directory name (max 64 characters, no whitespace). Optional `disable-model-invocation: true` hides the skill from the model's automatic discovery while keeping `/skill:<name>` available.
- **Loading**: only name + description + location go into the system prompt; the body is read on demand. New or edited skill files take effect on the user's **next submitted message** — there is no hot reload mid-run.
- **Explicit testing**: `/skill:<name> [args]` injects the skill body into a fresh run. This is your main testing tool.

## Creating a skill

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first — the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps, and should confirm before proceeding.

1. What should this skill enable the agent to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out. If research would help (searching docs, finding similar skills, looking up best practices), do it before asking — come prepared with context to reduce burden on the user.

### Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier (usually just the directory name)
- **description**: When to trigger, what it does. This is the primary triggering mechanism — include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Models tend to *undertrigger* skills, so make descriptions a little bit "pushy". For instance, instead of "How to build a dashboard for internal data.", write "How to build a simple fast dashboard to display internal data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the rest of the skill :)**

Write drafts into the workspace's `.agents/skills/<name>/` (project level) while iterating — it keeps experiments out of the user-level directory and makes cleanup a single `rm -rf`.

### Skill Writing Guide

#### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
```

#### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) - Always in context (~100 words)
2. **SKILL.md body** - In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** - As needed (unlimited, scripts can execute without loading)

These word counts are approximate and you can feel free to go longer if needed.

**Key patterns:**
- Keep SKILL.md under 500 lines; if you're approaching this limit, add an additional layer of hierarchy along with clear pointers about where the model using the skill should go next to follow up.
- Reference files clearly from SKILL.md with guidance on when to read them. Relative references resolve against the skill directory (the parent of SKILL.md).
- For large reference files (>300 lines), include a table of contents.

**Domain organization**: When a skill supports multiple domains/frameworks, organize by variant:

```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

The model reads only the relevant reference file.

#### Principle of Lack of Surprise

Skills must not contain malware, exploit code, or any content that could compromise system security. A skill's contents should not surprise the user in their intent if described. Don't go along with requests to create misleading skills or skills designed to facilitate unauthorized access, data exfiltration, or other malicious activities. Things like a "roleplay as an XYZ" are OK though.

#### Writing Patterns

Prefer using the imperative form in instructions.

**Defining output formats** - You can do it like this:

```markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

**Examples pattern** - It's useful to include examples:

```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### Writing Style

Try to explain to the model why things are important in lieu of heavy-handed musty MUSTs. Use theory of mind and try to make the skill general and not super-narrow to specific examples. Start by writing a draft and then look at it with fresh eyes and improve it.

### Test Cases

After writing the skill draft, come up with 2-3 realistic test prompts — the kind of thing a real user would actually say. Share them with the user: "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?" Then run them.

Save test cases to `evals/evals.json` inside the skill directory. Don't write assertions yet — just the prompts. You'll draft assertions while reviewing the first runs.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

## Running and evaluating test cases in neko

neko runs one conversation at a time, so the test loop is conversational rather than scripted:

1. **With-skill runs**: ask the user to open a **new session** and submit `/skill:<name> <test prompt>` for each test case. A fresh session matters — the current conversation already knows how the skill was written, which contaminates the test. Save notable outputs under `<skill-name>-workspace/iteration-<N>/eval-<id>/with_skill/` as a sibling of the skill directory when the outputs are files worth comparing across iterations.
2. **Baseline runs**: for a new skill, the baseline is the same prompt in a fresh session *without* invoking the skill. For improving an existing skill, snapshot the old version first (`cp -r <skill> <workspace>/skill-snapshot/`) so you can diff behavior.
3. **Draft assertions while waiting**: good assertions are objectively verifiable and have descriptive names ("output CSV has a profit_margin column", not "output looks right"). Subjective skills (writing style, design) are better evaluated qualitatively — don't force assertions onto things that need human judgment. Add them to `evals/evals.json` as an `expectations` array per eval.
4. **Grade**: when outputs come back, check each assertion against them. For programmatically checkable assertions, write and run a small script rather than eyeballing it — scripts are faster, more reliable, and reusable across iterations. Record results next to the outputs (e.g. `grading.json` with `{text, passed, evidence}` entries per assertion).
5. **Review with the user**: present the outputs and grading inline — for each test case, show the prompt, what happened, and what passed/failed. Ask: "How does this look? Anything you'd change?"

## Improving the skill

This is the heart of the loop. You've run the test cases, the user has reviewed the results, and now you need to make the skill better based on their feedback.

1. **Generalize from the feedback.** The skill should work across a million future prompts, not just the few examples you're iterating on. Rather than fiddly overfit changes or oppressively constrictive MUSTs, if there's a stubborn issue, try different metaphors or different patterns of working.
2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Read the transcripts, not just the final outputs — if the skill makes the model waste time on unproductive steps, cut the parts causing that.
3. **Explain the why.** Today's LLMs are smart and have good theory of mind. If you find yourself writing ALWAYS or NEVER in all caps, that's a yellow flag — reframe and explain the reasoning so the model understands why the thing you're asking for matters.
4. **Look for repeated work across test cases.** If every test run independently wrote a similar helper script or took the same multi-step approach, that's a strong signal the skill should bundle that script in `scripts/` and reference it. This saves every future invocation from reinventing the wheel.

Take your time and really mull improvements over. Write a draft revision, then look at it anew.

### The iteration loop

After improving the skill:

1. Apply your improvements to the skill
2. Rerun all test cases in fresh sessions (new iteration directory), including baselines
3. Review with the user, read the feedback, improve again, repeat

Keep going until the user is happy, the feedback is all empty, or you're not making meaningful progress.

---

## Description Optimization

The description field in SKILL.md frontmatter is the primary mechanism that determines whether the skill triggers. After creating or improving a skill, offer to optimize it.

### Step 1: Generate trigger eval queries

Create 20 eval queries — a mix of should-trigger and should-not-trigger. Save as JSON:

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

The queries must be realistic — concrete and specific, with file paths, personal context, column names, company names, URLs, a little backstory. Some lowercase, some with typos or casual speech. Focus on edge cases rather than clear-cut ones.

Bad: `"Format this data"`, `"Extract text from PDF"`

Good: `"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage..."`

For **should-trigger** queries (8-10), cover different phrasings of the same intent — formal and casual — including cases where the user doesn't name the skill or file type but clearly needs it. For **should-not-trigger** queries (8-10), the valuable ones are near-misses: adjacent domains, ambiguous phrasing sharing keywords but needing something different. "Write a fibonacci function" as a negative for a PDF skill is too easy — it tests nothing.

Note that models only consult skills for tasks they can't easily handle on their own — simple one-step queries may not trigger a skill even with a perfect description. Make your eval queries substantive enough that consulting a skill would actually help.

### Step 2: Review with user

Present the eval set for review using the HTML template in this skill's `assets/eval_review.html`:

1. Read the template
2. Replace the placeholders: `__EVAL_DATA_PLACEHOLDER__` → the JSON array (no quotes — it's a JS assignment), `__SKILL_NAME_PLACEHOLDER__` → the skill's name, `__SKILL_DESCRIPTION_PLACEHOLDER__` → the current description
3. Write to a temp file (e.g. `/tmp/eval_review_<skill-name>.html`) and open it with `open` (macOS) or tell the user the path
4. The user can edit queries, toggle should-trigger, add/remove entries, then "Export Eval Set" downloads the final JSON

This step matters — bad eval queries lead to bad descriptions.

### Step 3: Iterate the description

For each should-trigger query, reason honestly about whether the current description would make a model pick this skill; for each should-not-trigger query, whether it would wrongly fire. Rewrite the description to fix the failures, keeping it pushy but honest. Show the user before/after. The real confirmation is behavioral: the user tries a few of the trigger queries in fresh sessions and sees whether the skill gets picked up.

---

## Packaging for the skill market

When the user wants to share a skill through the skill market, package the directory as a zip with the skill folder as the single top-level entry (the market requires exactly one SKILL.md per package):

```bash
cd <parent-of-skill-dir> && zip -r <name>.zip <name>
```

Hand the resulting zip to the user — uploads are done by market administrators, not from this client.

---

Repeating the core loop for emphasis:

- Figure out what the skill is about
- Draft or edit the skill (in the workspace's `.agents/skills/`)
- Test via fresh sessions and `/skill:<name>`
- Evaluate with the user, improve, repeat
- Package the final skill and hand it to the user

Good luck!
