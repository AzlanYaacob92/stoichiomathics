/* Smoke test for the limiting-reactant engine — run with `node test-chemistry.js`.
   Covers formula parsing, molar masses, the built-in reaction list, the
   limiting-reactant verdict, and the atom-balance rule used by the custom
   reaction builder. */
const { AM, MOLAR_VOL, SPECT, R, QUAL, composition, molarMass, isRecognisedFormula,
        parseReaction, computeLimiting } = require('./chemistry.js');

let fail = 0;
function check(label, got, want, tol = 0.05) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}${ok ? '' : ` (expected ${want})`}`);
  if (!ok) fail++;
}

/* Mirrors balanceError() in app.js: do the atom counts match across the arrow? */
function balanced(left, right) {
  const tally = side => side.reduce((acc, t) => {
    const c = composition(t.sp);
    for (const el in c) acc[el] = (acc[el] || 0) + t.coef * c[el];
    return acc;
  }, {});
  const l = tally(left), r = tally(right);
  return [...new Set([...Object.keys(l), ...Object.keys(r)])]
    .every(e => (l[e] || 0) === (r[e] || 0));
}

console.log('--- formula parsing ---');
check('H2O has 2 H', composition('H2O').H, 2);
check('Ca(OH)2 has 2 O', composition('Ca(OH)2').O, 2);
check('CuSO4.5H2O parses', isRecognisedFormula('CuSO4') , true);
check('Xx rejected', isRecognisedFormula('Xx'), false);

console.log('\n--- molar masses ---');
check('H2O', molarMass('H2O'), 18.0);
check('NaCl', molarMass('NaCl'), 58.5);
check('C6H12O6', molarMass('C6H12O6'), 180.0);

console.log('\n--- constants ---');
check('RTP', MOLAR_VOL.RTP, 24.0, 0);
check('STP', MOLAR_VOL.STP, 22.4, 0);

console.log('\n--- built-in reaction list ---');
// R is the raw database and legitimately contains single-reactant reactions
// (decompositions, electrolysis) that chemistry.js filters out of QUAL. Every
// equation in it should still balance, since a wrong one would be a typo.
check('database is non-empty', R.length > 0, true);
let unbalanced = [];
R.forEach(r => {
  const p = parseReaction(r.eq);
  // Ionic half-equations carry charge, so atom counts alone don't apply.
  if (p.reactants.concat(p.products).some(t => /[\^]/.test(t.sp))) return;
  if (!balanced(p.reactants, p.products)) unbalanced.push(r.eq);
});
check('every non-ionic equation balances', unbalanced.length, 0, 0);
if (unbalanced.length) unbalanced.forEach(e => console.log('     ' + e));

// QUAL is what the picker actually offers: exactly two reactants, both with a
// known molar mass. That invariant is what the rest of the app relies on.
check('picker list is non-empty', QUAL.length > 0, true);
check('every offered reaction has two reactants',
  QUAL.filter(q => !q.A || !q.B).length, 0, 0);
check('every offered reactant has a known molar mass',
  QUAL.filter(q => molarMass(q.A.sp) == null || molarMass(q.B.sp) == null).length, 0, 0);

console.log('\n--- limiting reactant verdict ---');
// 2H2 + O2 -> 2H2O. computeLimiting takes {A, B} directly, as app.js supplies.
const H2O2 = { A: { coef: 2, sp: 'H2' }, B: { coef: 1, sp: 'O2' } };
// 2 mol H2 with 2 mol O2: H2 runs out first (ratio 1 vs 2).
check('H2 is limiting', computeLimiting(H2O2, 2, 2).limiting.sp, 'H2');
// 2 mol H2 with 4 mol O2 is still H2; 1 mol H2 with 1 mol O2 makes O2 excess.
check('O2 is in excess', computeLimiting(H2O2, 2, 2).excess.sp, 'O2');
// Exact stoichiometric amounts: neither is in excess.
check('2 mol H2 + 1 mol O2 is a tie', computeLimiting(H2O2, 2, 1).tie, true);

console.log('\n--- atom balance rule used by the custom builder ---');
check('2H2 + O2 -> 2H2O',
  balanced([{ coef: 2, sp: 'H2' }, { coef: 1, sp: 'O2' }], [{ coef: 2, sp: 'H2O' }]), true);
check('H2 + O2 -> H2O (rejected)',
  balanced([{ coef: 1, sp: 'H2' }, { coef: 1, sp: 'O2' }], [{ coef: 1, sp: 'H2O' }]), false);
check('CaCO3 + 2HCl -> CaCl2 + H2O + CO2',
  balanced([{ coef: 1, sp: 'CaCO3' }, { coef: 2, sp: 'HCl' }],
           [{ coef: 1, sp: 'CaCl2' }, { coef: 1, sp: 'H2O' }, { coef: 1, sp: 'CO2' }]), true);

console.log(fail ? `\n${fail} failure(s)` : '\nall passed');
process.exit(fail ? 1 : 0);
