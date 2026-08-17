# Lavender + Willow — design system

Built from the two palettes you supplied. Tokens live in `design-system.css`;
this file is the rulebook. Both are self-contained — drop them into any project,
or paste the token block into Claude when you want a design in this style.

## The one thing to know first

Every swatch in your two palettes is a **tint**. The darkest ones — Lavender
Purple `#916DD5` and Willow Green `#90CF8E` — reach only 3.92:1 and 1.83:1
against white. WCAG AA needs 4.5:1 for text.

So the ten source colours are **surfaces and fills, not text**. The system keeps
all ten unchanged and derives darker 500–900 steps for anything that has to be
read or clicked. Nothing in your palettes was altered; the ramps were extended
downward.

## Roles

| Role | Colour | Why |
|---|---|---|
| Primary / interactive | Lavender | Higher chroma, reads as the brand |
| Secondary / positive | Willow | Green already means "correct" — spend it there |
| Neutrals | Lavender-warmed greys | Pure grey next to lavender looks dirty |
| Danger | `#B4304A` | Borrowed; neither palette can signal error |

Lavender is the voice, green is the answer. Don't use green for navigation or
primary buttons — it drains the meaning out of every "correct" state.

## Verified pairings

Light mode, all against `--card` (white) unless noted:

- `--ink` `#1C1725` on white — **17.5:1**
- `--muted` `#5B5470` on white — **7.1:1**
- `--faint` `#8A7FA8` on white — 3.7:1 → placeholders and ≥24px only, never body copy
- white on `--primary` `#7A52C4` — **5.48:1** (this is the smallest lavender that holds white text)
- white on `--accent` `#356E38` — **6.11:1**
- `--lav-600` on `--lav-50` — **5.91:1** (soft button / chip)
- `--grn-700` on `--grn-50` — **5.65:1**
- white on `--danger` — **6.07:1**

Dark mode, against `--bg` `#151021`:

- `--ink` `#EBE0FF` — **14.8:1**
- `--muted` `#A79FC0` — **7.4:1**
- `--primary` `#AC8BEE` — **6.8:1**
- `--accent` `#A7DCA5` — **11.9:1**

Two known ceilings, deliberate rather than accidental:

- `--grn-600` `#4F9A50` is 3.46:1 — icons and large text only.
- `--warn` `#B8721F` is 3.84:1 — a fill; pair it with `--warn-ink`, never white.

In dark mode the light fills carry **dark** text (`--primary-ink` flips to
`#1C1725`). If you hardcode white on a button, dark mode breaks.

## Usage rules

**Surfaces.** Three levels, no more: `--bg` (the room) → `--card` (the thing) →
`--card-2` (the thing inside the thing). Shadows are lavender-tinted
(`rgba(46,27,82,…)`), never neutral black — a grey shadow on a lavender page
reads as smudge.

**Saturation budget.** At most one saturated element per view. The 400-step
swatches (`#916DD5`, `#90CF8E`) are for the primary button, the active tab, or
the one chart series that matters — not three of them at once. Everything else
sits at the 50–200 steps.

**Type.** No webfonts — this app has to work with no connection — and it's
tuned to read *soft*, not technical. Softness comes from the letterform
itself first, adjustments second. Two voices carry the hierarchy:

- **Display** (`--font-display`, Candara first) — headings ≥20px. Candara's
  strokes flare and taper instead of cutting square, which is the single
  biggest lever for "soft" in a system typeface. Where Candara isn't
  installed, the stack tries `ui-rounded` (resolves to SF Pro Rounded on
  Apple platforms) before falling back to Segoe UI / the platform sans —
  at that point softness comes from the adjustments below instead of the
  letterform. Headings use `text-wrap: balance` and near-zero tracking
  (`--tr-display`, `--tr-heading`) — negative tracking is what makes a
  headline feel engineered rather than written.
- **Body** (`--font-body`, Calibri first) — everything under 20px:
  paragraphs, labels, controls. Calibri's rounded terminals and open
  apertures keep small text friendly rather than clinical. Body copy sits
  at a 16px floor and 1.68 line-height, because this is a page students
  read slowly, not skim.
- **Mono** (`--font-mono`, Consolas first) — the second real voice.
  Reserved for anything numeric: masses, moles, ratios, calc lines.
  Consolas over Cascadia here too, for the same reason — rounder curves.
  Always `font-variant-numeric: tabular-nums` so digits line up in columns.

Weight is capped at 600 everywhere (`--w-bold` no longer means 700) —
nothing needs a heavy weight to read as a heading once the letterform is
doing the work, and 700 is one of the fastest ways to make type feel hard.
Georgia was considered and dropped separately: readable, but bookish, and
its oldstyle numerals fight a page built on calculation lines. Uppercase
labels use `--t-label` with `.06em` tracking (`--tr-label`) — still enough
air that capitals don't clump, without reaching for the wider spacing a
more technical system would use.

**Shape.** `--r-sm` inputs and chips, `--r-md` fields and callouts, `--r-lg`
cards, `--r-pill` buttons. Consistency here does more visual work than colour.

**Motion.** One curve (`--ease`), three durations. `--dur-fast` for hover,
`--dur` for state changes, `--dur-slow` for anything entering the page.
`prefers-reduced-motion` is already handled in the CSS.

**Focus.** `--focus-ring` on every interactive element. Never
`outline: none` without a replacement.

## Components included

`.ds-card` · `.ds-btn` (`--primary`, `--accent`, `--soft`, `--ghost`, `--danger`)
· `.ds-field` · `.ds-label` · `.ds-chip` (`--accent`, `--danger`, `--warn`)
· `.ds-note` (`--accent`, `--danger`, `--warn`)

They are thin wrappers over tokens. Build new components from the tokens
directly rather than overriding these.

## Using it with Claude

Paste the `:root` and `[data-theme="dark"]` blocks from `design-system.css`
into your prompt, then say:

> Use only these CSS custom properties for colour, spacing, radius, type and
> motion. No hardcoded hex values. Support both light and dark via the
> `data-theme` attribute and `prefers-color-scheme`.

The token names are the contract. If a design needs a colour that isn't a
token, that's a signal the system is missing a role — add it here rather than
inlining a hex.

## Applying it to Stoichiomathics

Not done yet — this repo still runs its teal/amber palette in `styles.css`.
The retheme is a variable remap (`--teal-*` → `--lav-*`, `--amber-*` →
`--grn-*`) plus a pass over the periodic-table cells, category accents and
limiting/excess colours, which are hardcoded against the teal system. Say the
word and I'll do it.
