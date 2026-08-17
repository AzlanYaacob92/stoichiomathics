# Chemculate Limiting Reactant

An interactive trainer for working out which reactant is limiting, one step at a time. Part of the [Chemculator](https://azlanyaacob92.github.io/) suite.

## Two modes

- **Learn** — walks through finding the limiting reactant, the thinking first and then the numbers.
- **Verify my answer** — shows the key figures at once, for comparing against work you have already done.

## Two methods

Students choose how they want to reason about it, and the working follows their choice:

- **Given reactant method** — pick one reactant to test as "used up first," then check whether there is enough of the other to match.
- **Direct mol comparison** — build a table of moles for both reactants, scale it to the equation's ratio, and read the limiting reactant off the table.

Which reactant is actually limiting never depends on which one the student tests first. The engine is symmetric; the pivot choice only reframes the presentation.

## Choosing a reaction

Search by species or formula, or tap elements on the periodic table to filter the built-in list (352 reactions, of which those with exactly two reactants are offered). You can also build your own equation — custom equations are **checked for atom balance** before they are accepted, since which reactant is limiting depends entirely on the mole ratio.

## The method

Moles: `n = m ÷ M_r`. For `aA + bB → …`, the amount of B needed to use up all the A is `n(A) × b/a`. If that is more than you have, B runs out first and is limiting; if less, A runs out first. The reactant left over is the one in excess.

## Conventions and limitations

- Relative atomic masses follow common data-booklet values (H = 1.0, O = 16.0, S = 32.1, Cl = 35.5, Ca = 40.1, Cu = 63.5 …).
- Molar gas volume: **24.0 dm³ mol⁻¹ at RTP (20 °C, 1 atm)**, **22.4 dm³ mol⁻¹ at STP (0 °C, 1 atm)**. If your syllabus defines RTP as 25 °C, the value should be 24.5 — change `MOLAR_VOL` in `chemistry.js` and the footer note in `index.html` together.
- State symbols and spectator H⁺/OH⁻ are omitted.
- Answers are given to 4 significant figures.
- This tool shows the method. Always re-check against your own mark scheme.

## Running it

Static HTML/CSS/JS, no build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

`index.html` loads `chemistry.js` before `app.js` — that order matters.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure — landing, reaction picker, custom builder, both methods |
| `styles.css` | All appearance, including the light/dark themes |
| `chemistry.js` | The chemistry: formula parsing, the reaction database, limiting-reactant maths. No UI code. |
| `app.js` | The behaviour: wizard navigation, the periodic table, form building, the reveal flow |
| `test-chemistry.js` | Smoke test for the engine |
| `DESIGN-SYSTEM.md`, `design-system.css` | The lavender/willow design system — **not yet applied to this app**, see below |

## Tests

```bash
node test-chemistry.js
```

Checks formula parsing, molar masses, that every built-in equation balances, the limiting-reactant verdict, and the atom-balance rule. Exits non-zero on failure.

## On the design system

`design-system.css` is committed but deliberately **not** linked from `index.html`. It cannot simply be loaded alongside `styles.css`: its dark block is scoped as `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`, which outranks `styles.css`'s `[data-theme="dark"]` no matter which file loads first. Linking it turns dark mode lavender while every accent stays teal.

Adopting it means doing the retheme described at the end of `DESIGN-SYSTEM.md` — remapping `--teal-*` → `--lav-*` and `--amber-*` → `--grn-*`, plus a pass over the periodic-table cells, category accents, and limiting/excess colours, which are hardcoded against the teal system.
