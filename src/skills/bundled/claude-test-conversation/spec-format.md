# Spec file format

One Markdown file per spec in `.claude-test/specs/`. File name: lower-case words joined by
hyphens, `.md`. Files starting with `_` and `README.md` are ignored.

```markdown
---
id: ct_k3xq5mwa            # minted by the helper when a run creates the file; leave it as it is, and leave it out of files you write by hand
allow_navigation: true     # optional; default false = reach everything by clicking from the base URL
timeout_ms: 180000         # optional; per-spec budget — when set, time is the only limit; default ≈ 3 min and ≈ 30 browser actions
tags: [creates-data]       # optional; "creates-data" marks a spec whose steps add records to the app
area: search               # optional; one lower-case word, the part of the app it is about: Claude Test's panel groups tests by it
---
# Search finds an article

From the landing page, search for "refund".

## Passes when
- Must: the results list shows an entry titled "Refund policy".
- Must not: the text "No articles match your search".
```

A spec has three parts:

| Part | What goes in it |
|---|---|
| `# heading` | The label people see in results. One line. |
| prose under it (an optional `## Steps` heading is allowed) | The goal and the data, not the clicks: where to start, what to do, what made-up values to type. "Add the travel mug to the cart and open the cart", not "click …, then click …". Name pages by path (`/pricing`), never by full URL. |
| `## Passes when` | `- Must: …` and `- Must not: …` lines about the one screen where the steps end. Quote visible text exactly: "reads" for a whole string, "contains" for its stable part. "The page loads" or "no error" alone is not a criterion. |

Front matter is optional. `id` is the spec's stable identity (a run's `write-spec` helper mints it; a hand-written
spec may omit it, and nothing else should invent or change one). `allow_navigation` (default false: the agent
follows the page's own links; true lets it open paths on your host directly), `timeout_ms`,
`tags` and `area` are read too; other keys are kept and ignored.

**Specs that need data.** If a journey needs a record to exist, either configure a seed script as
`setupCommand` in `.claude-testrc` (before each run you are asked, and it runs only if you say yes; it must be safe to run twice), or
write the creation into the steps as a conditional, clearly named first step and tag the spec:

```markdown
---
tags: [creates-data]
---
# A saved recipe can be found by its name

If the app has no recipe named "Claude Test demo recipe", add one from "Add a recipe" with
that name and the ingredient "2 eggs". Then search the recipe list for "demo recipe".

## Passes when
- Must: the results list shows a card titled "Claude Test demo recipe".
```
The fixed "Claude Test demo …" name lets later runs find and reuse the record instead of adding
another — for a record the journey only NEEDS. Such a spec never deletes anything.

**`{run}`: a value of this run's own.** When the journey under test IS the creating or editing (add a
note, save a change), a record an earlier run left behind must not be able to pass it. Write `{run}` in
the value the steps type and quote the same value in the Must line; each run shows `{run}` as a short
stamp of its own (like `1017-102442`) when it reads the spec, so only this run's typing can make the
line hold:

```markdown
---
tags: [creates-data]
---
# Add a note

Add a note titled "Note from run {run}" with the body "Written by Claude Test".

## Passes when
- Must: the notes list shows an entry titled "Note from run {run}".
```

`{run}` is the format's one placeholder: written exactly so, only inside a value the steps type and the
Must lines that quote it, never in the spec's `# heading` or a path, and never followed directly by a digit or by a dash and
a digit (`Item {run} a`, not `Item {run}-1`). A run records PASS for such a spec only
after it typed that value and then acted on the page again (a click, key press, navigation, wait or
more typing), in the browser it opened new for that spec.

Before running specs tagged `creates-data` against a site other people use, review them. There is no URL in a spec: the address comes from
`baseUrl` in `.claude-testrc`, so the same spec runs against a laptop, a preview, or staging.

**Goal-oriented, not prescriptive.** Say WHAT to achieve; the agent figures out HOW from what it
sees. Three to ten lines of intent beat thirty lines of click-this-then-that, and keep passing when
the button moves.

**"Passes when" must be checkable from a single screenshot at the end.** "The invoice list shows a
row numbered INV-… with status Draft" is good. "The total is higher than before" is bad (needs
memory). Say what must be visible, and where useful what must *not* be ("…and no error banner").

A good spec:
- is a journey where it can be: two or more actions through the app's main create / open / edit path,
  ending on a screen whose content proves they took effect — a spec that only confirms a page or dialog
  renders is a weaker, periphery check;
- can be finished by a visitor in about two minutes and is safe to repeat on every run;
- names only controls and strings that really exist (copied from the code or the screen);
- quotes the whole visible string when it says a line "reads" something, or says "contains …" when
  it means part of it — a half-quoted string is judged differently by different runs;
- when the code renders a heading or label with a dynamic part (a count, a name, a date), quotes only
  its stable part, with "contains" wording, never the dynamic part: `Must: the heading contains "My notes"`
  for a heading rendered as "My notes (2 notes)", never `Must: the heading reads "My notes"`;
- checks an outcome the page would not show if the step did nothing;
- says *where* on the screen the outcome appears ("the results list shows …", "the dialog headed
  'Search' shows …", "the order summary's total line reads …") — on a very large app this lets a run
  check that one region instead of re-reading a page whose accessibility snapshot is thousands of
  lines, which is slower, dearer and easier to misjudge;
- asserts seeded data by value when a seed, fixture or migration file fixes it (and cites that file),
  and nothing the code computes at run time (dates, random ids, rotating content);
- uses an unmistakable sentinel for any free text it types ("zzqx-test-note", "Claude Test demo recipe") so the
  end screen can be checked for exactly that string, with `{run}` in it when the journey creates or edits that record;
- contains no credentials, no environment variables, no other hosts;
- when the app has accounts, says from which vantage it is written — "As a visitor, …" or "Signed in, …"
  at the start of the steps — so a run that meets a sign-in screen can tell a regression from a
  missing session.
