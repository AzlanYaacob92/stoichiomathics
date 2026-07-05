/* ============================================================================
   chemistry.js  —  domain layer (no DOM)
   Owns: relative atomic masses, the reaction database, reaction categories,
   formula notation, molar-mass calculation, and the limiting-reactant maths.
   Loaded before app.js.  Classic script so it works over file://.
   ========================================================================== */

/* ---- Relative atomic masses (common data-booklet precision) -------------- */
const AM = {
  H:1.0, He:4.0, Li:6.9, Be:9.0, B:10.8, C:12.0, N:14.0, O:16.0, F:19.0, Ne:20.2,
  Na:23.0, Mg:24.3, Al:27.0, Si:28.1, P:31.0, S:32.1, Cl:35.5, Ar:39.9,
  K:39.1, Ca:40.1, Sc:45.0, Ti:47.9, V:50.9, Cr:52.0, Mn:54.9, Fe:55.8, Co:58.9,
  Ni:58.7, Cu:63.5, Zn:65.4, Ga:69.7, Ge:72.6, As:74.9, Se:79.0, Br:79.9, Kr:83.8,
  Rb:85.5, Sr:87.6, Y:88.9, Zr:91.2, Nb:92.9, Mo:95.9, Tc:98.0, Ru:101.1, Rh:102.9,
  Pd:106.4, Ag:107.9, Cd:112.4, In:114.8, Sn:118.7, Sb:121.8, Te:127.6, I:126.9, Xe:131.3,
  Cs:132.9, Ba:137.3, La:138.9, Hf:178.5, Ta:180.9, W:183.8, Re:186.2, Os:190.2, Ir:192.2,
  Pt:195.1, Au:197.0, Hg:200.6, Tl:204.4, Pb:207.2, Bi:209.0, Po:209.0, At:210.0, Rn:222.0
};

/* ---- Reaction categories (label + accent colour) ------------------------- */
const CAT = {
  neut:{label:"Neutralisation",color:"var(--c-neut)"},
  ametal:{label:"Acid + metal",color:"var(--c-ametal)"},
  carb:{label:"Acid + carbonate",color:"var(--c-carb)"},
  oxide:{label:"Acid + oxide / base",color:"var(--c-oxide)"},
  comb:{label:"Combustion",color:"var(--c-comb)"},
  precip:{label:"Precipitation",color:"var(--c-precip)"},
  decomp:{label:"Thermal decomposition",color:"var(--c-decomp)"},
  disp:{label:"Redox / displacement",color:"var(--c-disp)"},
  complex:{label:"Complex ions & d-block",color:"var(--c-complex)"},
  pblock:{label:"p-block (groups 13–17)",color:"var(--c-pblock)"},
  synth:{label:"Synthesis / industrial",color:"var(--c-synth)"},
  titr:{label:"Redox titration (ionic)",color:"var(--c-titr)"},
  elec:{label:"Electrolysis",color:"var(--c-elec)"}
};

/* ---- Formula notation: species/equation string -> HTML ------------------- */
// A single species, e.g. "2Al2(SO4)3" or "MnO4^-", with subscripts + charges.
function fmtSpecies(s){
  let coef="", rest=s;
  const m = s.match(/^(\d+(?:\/\d+)?)([A-Za-z(\[].*)$/);
  if(m){ coef=m[1]; rest=m[2]; }
  let out="";
  for(let i=0;i<rest.length;i++){
    const c=rest[i];
    if(c==="^"){
      let j=i+1, ch="";
      while(j<rest.length && /[0-9+\-]/.test(rest[j])){ ch+=rest[j]; j++; }
      out+="<sup>"+ch+"</sup>"; i=j-1;
    } else if(/[0-9]/.test(c)){
      let j=i, dg="";
      while(j<rest.length && /[0-9]/.test(rest[j])){ dg+=rest[j]; j++; }
      out+="<sub>"+dg+"</sub>"; i=j-1;
    } else { out+=c; }
  }
  return (coef?'<span class="coef">'+coef+'</span>':'')+out;
}
// A whole equation with +, ->, <=> separators.
function fmtEq(eq){
  return eq.split(" ").map(t=>{
    if(t==="+") return '<span class="op">+</span>';
    if(t==="->") return '<span class="arrow">→</span>';
    if(t==="<=>") return '<span class="arrow">⇌</span>';
    return fmtSpecies(t);
  }).join(" ");
}
// A species with no leading coefficient (same renderer, clearer name at call sites).
const fmtFormula = fmtSpecies;

/* ---- Composition, molar mass -------------------------------------------- */
// Parse a formula into {element: count}, honouring ( ) and [ ] groups.
// The charge (^…) is dropped — it does not affect molar mass.
function composition(formula){
  formula = formula.split('^')[0];
  let i=0;
  function readNum(){ let s=''; while(i<formula.length && /[0-9]/.test(formula[i])){ s+=formula[i]; i++; } return s?parseInt(s,10):null; }
  function parseGroup(){
    const comp={};
    const merge=(sub,mult)=>{ for(const k in sub) comp[k]=(comp[k]||0)+sub[k]*mult; };
    while(i<formula.length){
      const c=formula[i];
      if(c==='('||c==='['){ i++; const sub=parseGroup(); const m=readNum()||1; merge(sub,m); }
      else if(c===')'||c===']'){ i++; return comp; }
      else if(/[A-Z]/.test(c)){ let sym=c; i++; while(i<formula.length && /[a-z]/.test(formula[i])){ sym+=formula[i]; i++; } const n=readNum()||1; comp[sym]=(comp[sym]||0)+n; }
      else { i++; }
    }
    return comp;
  }
  return parseGroup();
}
function molarMass(sp){ const c=composition(sp); let m=0; for(const k in c){ if(!(k in AM)) return null; m+=AM[k]*c[k]; } return m; }
// Per-element contributions, used to show the molar-mass breakdown.
function massParts(sp){ const c=composition(sp); return Object.entries(c).map(([el,n])=>({el,n,a:AM[el]})); }

/* ---- Reaction parsing --------------------------------------------------- */
// Spectators excluded from limiting-reactant logic (supplied in excess).
const SPECT = new Set(['H^+','OH^-','e^-']);
// Split a token into {coef, sp}, e.g. "2HCl" -> {coef:2, sp:"HCl"}.
function splitToken(tok){
  const m = tok.match(/^(\d+)(.+)$/);
  if(m && /^[A-Za-z(\[]/.test(m[2])) return {coef:parseInt(m[1],10), sp:m[2]};
  return {coef:1, sp:tok};
}
function parseSide(side){ return side.trim().split(' + ').map(t=>t.trim()).filter(Boolean).map(splitToken); }
function parseReaction(eq){
  const isEq = eq.includes('<=>');
  const [lhs,rhs] = eq.split(isEq?'<=>':'->');
  return { reactants:parseSide(lhs), products:parseSide(rhs), equil:isEq };
}

/* ---- The reaction database ---------------------------------------------- */
const R = [
  // Neutralisation
  {eq:"HCl + NaOH -> NaCl + H2O", cat:"neut", el:["H","Cl","Na","O"]},
  {eq:"2HCl + Ca(OH)2 -> CaCl2 + 2H2O", cat:"neut", el:["H","Cl","Ca","O"]},
  {eq:"H2SO4 + 2NaOH -> Na2SO4 + 2H2O", cat:"neut", el:["H","S","O","Na"]},
  {eq:"H2SO4 + 2KOH -> K2SO4 + 2H2O", cat:"neut", el:["H","S","O","K"]},
  {eq:"HNO3 + NaOH -> NaNO3 + H2O", cat:"neut", el:["H","N","O","Na"]},
  {eq:"HNO3 + KOH -> KNO3 + H2O", cat:"neut", el:["H","N","O","K"]},
  {eq:"2HNO3 + Ca(OH)2 -> Ca(NO3)2 + 2H2O", cat:"neut", el:["H","N","O","Ca"]},
  {eq:"H3PO4 + 3NaOH -> Na3PO4 + 3H2O", cat:"neut", el:["H","P","O","Na"]},
  {eq:"3HCl + Al(OH)3 -> AlCl3 + 3H2O", cat:"neut", el:["H","Cl","Al","O"]},
  {eq:"CH3COOH + NaOH -> CH3COONa + H2O", cat:"neut", el:["C","H","O","Na"]},
  {eq:"H2SO4 + 2NH3 -> (NH4)2SO4", cat:"neut", el:["H","S","O","N"]},
  {eq:"NH3 + HCl -> NH4Cl", cat:"neut", el:["N","H","Cl"]},
  {eq:"H^+ + OH^- -> H2O", cat:"neut", el:["H","O"], cond:"net ionic"},

  // Acid + metal
  {eq:"Zn + 2HCl -> ZnCl2 + H2", cat:"ametal", el:["Zn","H","Cl"]},
  {eq:"Mg + 2HCl -> MgCl2 + H2", cat:"ametal", el:["Mg","H","Cl"]},
  {eq:"Fe + 2HCl -> FeCl2 + H2", cat:"ametal", el:["Fe","H","Cl"]},
  {eq:"Ca + 2HCl -> CaCl2 + H2", cat:"ametal", el:["Ca","H","Cl"]},
  {eq:"2Al + 6HCl -> 2AlCl3 + 3H2", cat:"ametal", el:["Al","H","Cl"]},
  {eq:"Mg + H2SO4 -> MgSO4 + H2", cat:"ametal", el:["Mg","H","S","O"]},
  {eq:"Zn + H2SO4 -> ZnSO4 + H2", cat:"ametal", el:["Zn","H","S","O"]},
  {eq:"Fe + H2SO4 -> FeSO4 + H2", cat:"ametal", el:["Fe","H","S","O"]},
  {eq:"2Al + 3H2SO4 -> Al2(SO4)3 + 3H2", cat:"ametal", el:["Al","H","S","O"]},

  // Acid + carbonate / hydrogencarbonate
  {eq:"CaCO3 + 2HCl -> CaCl2 + H2O + CO2", cat:"carb", el:["Ca","C","O","H","Cl"]},
  {eq:"Na2CO3 + 2HCl -> 2NaCl + H2O + CO2", cat:"carb", el:["Na","C","O","H","Cl"]},
  {eq:"NaHCO3 + HCl -> NaCl + H2O + CO2", cat:"carb", el:["Na","H","C","O","Cl"]},
  {eq:"MgCO3 + 2HCl -> MgCl2 + H2O + CO2", cat:"carb", el:["Mg","C","O","H","Cl"]},
  {eq:"CaCO3 + H2SO4 -> CaSO4 + H2O + CO2", cat:"carb", el:["Ca","C","O","H","S"]},
  {eq:"2NaHCO3 + H2SO4 -> Na2SO4 + 2H2O + 2CO2", cat:"carb", el:["Na","H","C","O","S"]},
  {eq:"K2CO3 + 2HNO3 -> 2KNO3 + H2O + CO2", cat:"carb", el:["K","C","O","H","N"]},

  // Acid + oxide / base (oxides)
  {eq:"CuO + H2SO4 -> CuSO4 + H2O", cat:"oxide", el:["Cu","O","H","S"]},
  {eq:"CuO + 2HCl -> CuCl2 + H2O", cat:"oxide", el:["Cu","O","H","Cl"]},
  {eq:"MgO + 2HCl -> MgCl2 + H2O", cat:"oxide", el:["Mg","O","H","Cl"]},
  {eq:"ZnO + 2HCl -> ZnCl2 + H2O", cat:"oxide", el:["Zn","O","H","Cl"]},
  {eq:"CaO + 2HCl -> CaCl2 + H2O", cat:"oxide", el:["Ca","O","H","Cl"]},
  {eq:"Fe2O3 + 6HCl -> 2FeCl3 + 3H2O", cat:"oxide", el:["Fe","O","H","Cl"]},
  {eq:"Al2O3 + 6HCl -> 2AlCl3 + 3H2O", cat:"oxide", el:["Al","O","H","Cl"]},
  {eq:"CuO + H2SO4 -> CuSO4 + H2O", cat:"oxide", el:["Cu","O","H","S"], skip:true},

  // Combustion
  {eq:"C + O2 -> CO2", cat:"comb", el:["C","O"]},
  {eq:"2C + O2 -> 2CO", cat:"comb", el:["C","O"], cond:"incomplete"},
  {eq:"2H2 + O2 -> 2H2O", cat:"comb", el:["H","O"]},
  {eq:"S + O2 -> SO2", cat:"comb", el:["S","O"]},
  {eq:"2Mg + O2 -> 2MgO", cat:"comb", el:["Mg","O"]},
  {eq:"4Al + 3O2 -> 2Al2O3", cat:"comb", el:["Al","O"]},
  {eq:"CH4 + 2O2 -> CO2 + 2H2O", cat:"comb", el:["C","H","O"]},
  {eq:"2C2H6 + 7O2 -> 4CO2 + 6H2O", cat:"comb", el:["C","H","O"]},
  {eq:"C3H8 + 5O2 -> 3CO2 + 4H2O", cat:"comb", el:["C","H","O"]},
  {eq:"2C4H10 + 13O2 -> 8CO2 + 10H2O", cat:"comb", el:["C","H","O"]},
  {eq:"2C8H18 + 25O2 -> 16CO2 + 18H2O", cat:"comb", el:["C","H","O"], cond:"octane"},
  {eq:"C2H5OH + 3O2 -> 2CO2 + 3H2O", cat:"comb", el:["C","H","O"], cond:"ethanol"},
  {eq:"2CH3OH + 3O2 -> 2CO2 + 4H2O", cat:"comb", el:["C","H","O"], cond:"methanol"},
  {eq:"C6H12O6 + 6O2 -> 6CO2 + 6H2O", cat:"comb", el:["C","H","O"], cond:"glucose / respiration"},

  // Precipitation
  {eq:"AgNO3 + NaCl -> AgCl + NaNO3", cat:"precip", el:["Ag","N","O","Na","Cl"]},
  {eq:"AgNO3 + KBr -> AgBr + KNO3", cat:"precip", el:["Ag","N","O","K","Br"]},
  {eq:"AgNO3 + KI -> AgI + KNO3", cat:"precip", el:["Ag","N","O","K","I"]},
  {eq:"BaCl2 + Na2SO4 -> BaSO4 + 2NaCl", cat:"precip", el:["Ba","Cl","Na","S","O"]},
  {eq:"BaCl2 + H2SO4 -> BaSO4 + 2HCl", cat:"precip", el:["Ba","Cl","H","S","O"]},
  {eq:"Pb(NO3)2 + 2KI -> PbI2 + 2KNO3", cat:"precip", el:["Pb","N","O","K","I"]},
  {eq:"Pb(NO3)2 + 2NaCl -> PbCl2 + 2NaNO3", cat:"precip", el:["Pb","N","O","Na","Cl"]},
  {eq:"Pb(NO3)2 + Na2SO4 -> PbSO4 + 2NaNO3", cat:"precip", el:["Pb","N","O","Na","S"]},
  {eq:"CuSO4 + 2NaOH -> Cu(OH)2 + Na2SO4", cat:"precip", el:["Cu","S","O","Na","H"]},
  {eq:"FeCl3 + 3NaOH -> Fe(OH)3 + 3NaCl", cat:"precip", el:["Fe","Cl","Na","O","H"]},
  {eq:"FeSO4 + 2NaOH -> Fe(OH)2 + Na2SO4", cat:"precip", el:["Fe","S","O","Na","H"]},
  {eq:"MgCl2 + 2NaOH -> Mg(OH)2 + 2NaCl", cat:"precip", el:["Mg","Cl","Na","O","H"]},
  {eq:"CaCl2 + Na2CO3 -> CaCO3 + 2NaCl", cat:"precip", el:["Ca","Cl","Na","C","O"]},
  {eq:"BaCl2 + Na2CO3 -> BaCO3 + 2NaCl", cat:"precip", el:["Ba","Cl","Na","C","O"]},
  {eq:"2AgNO3 + Na2CO3 -> Ag2CO3 + 2NaNO3", cat:"precip", el:["Ag","N","O","Na","C"]},
  {eq:"Ag^+ + Cl^- -> AgCl", cat:"precip", el:["Ag","Cl"], cond:"net ionic"},

  // Thermal decomposition
  {eq:"CaCO3 -> CaO + CO2", cat:"decomp", el:["Ca","C","O"], cond:"Δ"},
  {eq:"2NaHCO3 -> Na2CO3 + H2O + CO2", cat:"decomp", el:["Na","H","C","O"], cond:"Δ"},
  {eq:"CuCO3 -> CuO + CO2", cat:"decomp", el:["Cu","C","O"], cond:"Δ"},
  {eq:"MgCO3 -> MgO + CO2", cat:"decomp", el:["Mg","C","O"], cond:"Δ"},
  {eq:"Cu(OH)2 -> CuO + H2O", cat:"decomp", el:["Cu","O","H"], cond:"Δ"},
  {eq:"2KClO3 -> 2KCl + 3O2", cat:"decomp", el:["K","Cl","O"], cond:"Δ, MnO₂ cat."},
  {eq:"2H2O2 -> 2H2O + O2", cat:"decomp", el:["H","O"], cond:"MnO₂ cat."},
  {eq:"2KMnO4 -> K2MnO4 + MnO2 + O2", cat:"decomp", el:["K","Mn","O"], cond:"Δ"},
  {eq:"2KNO3 -> 2KNO2 + O2", cat:"decomp", el:["K","N","O"], cond:"Δ"},
  {eq:"2Pb(NO3)2 -> 2PbO + 4NO2 + O2", cat:"decomp", el:["Pb","N","O"], cond:"Δ"},
  {eq:"2Cu(NO3)2 -> 2CuO + 4NO2 + O2", cat:"decomp", el:["Cu","N","O"], cond:"Δ"},
  {eq:"2AgNO3 -> 2Ag + 2NO2 + O2", cat:"decomp", el:["Ag","N","O"], cond:"Δ"},
  {eq:"NH4Cl -> NH3 + HCl", cat:"decomp", el:["N","H","Cl"], cond:"Δ (then recombines)"},
  {eq:"(NH4)2Cr2O7 -> Cr2O3 + N2 + 4H2O", cat:"decomp", el:["N","H","Cr","O"], cond:"Δ"},

  // Redox / displacement
  {eq:"Zn + CuSO4 -> ZnSO4 + Cu", cat:"disp", el:["Zn","Cu","S","O"]},
  {eq:"Fe + CuSO4 -> FeSO4 + Cu", cat:"disp", el:["Fe","Cu","S","O"]},
  {eq:"Mg + CuSO4 -> MgSO4 + Cu", cat:"disp", el:["Mg","Cu","S","O"]},
  {eq:"Cu + 2AgNO3 -> Cu(NO3)2 + 2Ag", cat:"disp", el:["Cu","Ag","N","O"]},
  {eq:"Zn + Pb(NO3)2 -> Zn(NO3)2 + Pb", cat:"disp", el:["Zn","Pb","N","O"]},
  {eq:"Cl2 + 2KBr -> 2KCl + Br2", cat:"disp", el:["Cl","K","Br"]},
  {eq:"Cl2 + 2KI -> 2KCl + I2", cat:"disp", el:["Cl","K","I"]},
  {eq:"Br2 + 2KI -> 2KBr + I2", cat:"disp", el:["Br","K","I"]},
  {eq:"2Na + 2H2O -> 2NaOH + H2", cat:"disp", el:["Na","H","O"]},
  {eq:"2K + 2H2O -> 2KOH + H2", cat:"disp", el:["K","H","O"]},
  {eq:"Ca + 2H2O -> Ca(OH)2 + H2", cat:"disp", el:["Ca","H","O"]},
  {eq:"2Al + Fe2O3 -> Al2O3 + 2Fe", cat:"disp", el:["Al","Fe","O"], cond:"thermite, Δ"},
  {eq:"Fe2O3 + 3CO -> 2Fe + 3CO2", cat:"disp", el:["Fe","O","C"], cond:"blast furnace"},
  {eq:"ZnO + C -> Zn + CO", cat:"disp", el:["Zn","O","C"], cond:"Δ"},
  {eq:"CuO + H2 -> Cu + H2O", cat:"disp", el:["Cu","O","H"], cond:"reduction"},
  {eq:"3Mg + N2 -> Mg3N2", cat:"disp", el:["Mg","N"]},

  // Synthesis / industrial
  {eq:"N2 + 3H2 <=> 2NH3", cat:"synth", el:["N","H"], cond:"Haber; Fe cat., 450 °C, 200 atm"},
  {eq:"2SO2 + O2 <=> 2SO3", cat:"synth", el:["S","O"], cond:"Contact; V₂O₅, 450 °C"},
  {eq:"SO3 + H2O -> H2SO4", cat:"synth", el:["S","O","H"]},
  {eq:"4NH3 + 5O2 -> 4NO + 6H2O", cat:"synth", el:["N","H","O"], cond:"Ostwald; Pt/Rh cat."},
  {eq:"2NO + O2 -> 2NO2", cat:"synth", el:["N","O"]},
  {eq:"3NO2 + H2O -> 2HNO3 + NO", cat:"synth", el:["N","O","H"]},
  {eq:"N2 + O2 -> 2NO", cat:"synth", el:["N","O"], cond:"high T"},
  {eq:"H2 + Cl2 -> 2HCl", cat:"synth", el:["H","Cl"]},
  {eq:"2Fe + 3Cl2 -> 2FeCl3", cat:"synth", el:["Fe","Cl"]},
  {eq:"CaO + H2O -> Ca(OH)2", cat:"synth", el:["Ca","O","H"]},
  {eq:"Na2O + H2O -> 2NaOH", cat:"synth", el:["Na","O","H"]},
  {eq:"CO2 + H2O -> H2CO3", cat:"synth", el:["C","O","H"]},
  {eq:"CaO + CO2 -> CaCO3", cat:"synth", el:["Ca","O","C"]},
  {eq:"Ca(OH)2 + CO2 -> CaCO3 + H2O", cat:"synth", el:["Ca","O","H","C"], cond:"limewater test"},
  {eq:"C + H2O -> CO + H2", cat:"synth", el:["C","H","O"], cond:"water gas, Δ"},
  {eq:"CO + 2H2 -> CH3OH", cat:"synth", el:["C","O","H"], cond:"catalyst"},
  {eq:"2C + SiO2 -> Si + 2CO", cat:"synth", el:["C","Si","O"], cond:"Δ"},
  {eq:"CaC2 + 2H2O -> Ca(OH)2 + C2H2", cat:"synth", el:["Ca","C","H","O"]},

  // Redox titration (ionic + half equations)
  {eq:"2MnO4^- + 5C2O4^2- + 16H^+ -> 2Mn^2+ + 10CO2 + 8H2O", cat:"titr", el:["Mn","O","C","H"], cond:"permanganate–oxalate"},
  {eq:"MnO4^- + 5Fe^2+ + 8H^+ -> Mn^2+ + 5Fe^3+ + 4H2O", cat:"titr", el:["Mn","O","Fe","H"], cond:"permanganate–iron(II)"},
  {eq:"2MnO4^- + 5H2O2 + 6H^+ -> 2Mn^2+ + 5O2 + 8H2O", cat:"titr", el:["Mn","O","H"], cond:"permanganate–peroxide"},
  {eq:"Cr2O7^2- + 6Fe^2+ + 14H^+ -> 2Cr^3+ + 6Fe^3+ + 7H2O", cat:"titr", el:["Cr","O","Fe","H"], cond:"dichromate–iron(II)"},
  {eq:"I2 + 2S2O3^2- -> 2I^- + S4O6^2-", cat:"titr", el:["I","S","O"], cond:"iodine–thiosulfate"},
  {eq:"2Cu^2+ + 4I^- -> 2CuI + I2", cat:"titr", el:["Cu","I"], cond:"iodometry of Cu(II)"},
  {eq:"MnO4^- + 8H^+ + 5e^- -> Mn^2+ + 4H2O", cat:"titr", el:["Mn","O","H"], cond:"half-equation"},
  {eq:"Cr2O7^2- + 14H^+ + 6e^- -> 2Cr^3+ + 7H2O", cat:"titr", el:["Cr","O","H"], cond:"half-equation"},

  // Electrolysis
  {eq:"2H2O -> 2H2 + O2", cat:"elec", el:["H","O"], cond:"electrolysis of water"},
  {eq:"2NaCl -> 2Na + Cl2", cat:"elec", el:["Na","Cl"], cond:"molten"},
  {eq:"2KBr -> 2K + Br2", cat:"elec", el:["K","Br"], cond:"molten"},
  {eq:"2Al2O3 -> 4Al + 3O2", cat:"elec", el:["Al","O"], cond:"molten, cryolite"},
  {eq:"2NaCl + 2H2O -> 2NaOH + H2 + Cl2", cat:"elec", el:["Na","Cl","H","O"], cond:"chlor-alkali (aq)"},

  // --- Transition metals: precipitates, complexes, colour tests (d-block) ---
  {eq:"Cu^2+ + 2OH^- -> Cu(OH)2", cat:"complex", el:["Cu","O","H"], cond:"blue ppt"},
  {eq:"Fe^2+ + 2OH^- -> Fe(OH)2", cat:"complex", el:["Fe","O","H"], cond:"green ppt"},
  {eq:"Fe^3+ + 3OH^- -> Fe(OH)3", cat:"complex", el:["Fe","O","H"], cond:"red-brown ppt"},
  {eq:"4Fe(OH)2 + O2 + 2H2O -> 4Fe(OH)3", cat:"complex", el:["Fe","O","H"], cond:"aerial oxidation"},
  {eq:"Cr^3+ + 3OH^- -> Cr(OH)3", cat:"complex", el:["Cr","O","H"], cond:"grey-green ppt"},
  {eq:"Cr(OH)3 + 3OH^- -> [Cr(OH)6]^3-", cat:"complex", el:["Cr","O","H"], cond:"amphoteric, dissolves"},
  {eq:"Zn^2+ + 2OH^- -> Zn(OH)2", cat:"complex", el:["Zn","O","H"], cond:"white ppt"},
  {eq:"Zn(OH)2 + 2OH^- -> [Zn(OH)4]^2-", cat:"complex", el:["Zn","O","H"], cond:"amphoteric, dissolves"},
  {eq:"Cu^2+ + 4NH3 -> [Cu(NH3)4]^2+", cat:"complex", el:["Cu","N","H"], cond:"deep blue"},
  {eq:"Ag^+ + 2NH3 -> [Ag(NH3)2]^+", cat:"complex", el:["Ag","N","H"], cond:"Tollens' reagent"},
  {eq:"Ni^2+ + 6NH3 -> [Ni(NH3)6]^2+", cat:"complex", el:["Ni","N","H"], cond:"ligand exchange"},
  {eq:"[Co(H2O)6]^2+ + 4Cl^- <=> [CoCl4]^2- + 6H2O", cat:"complex", el:["Co","H","O","Cl"], cond:"pink ⇌ blue"},
  {eq:"Fe^3+ + SCN^- -> [Fe(SCN)]^2+", cat:"complex", el:["Fe","S","C","N"], cond:"blood-red test"},
  {eq:"Cr2O7^2- + H2O <=> 2CrO4^2- + 2H^+", cat:"complex", el:["Cr","O","H"], cond:"orange ⇌ yellow"},
  {eq:"2Cu^+ -> Cu + Cu^2+", cat:"complex", el:["Cu"], cond:"disproportionation"},

  // --- Transition-metal redox & extraction (d-block) ---
  {eq:"2Fe^3+ + Cu -> 2Fe^2+ + Cu^2+", cat:"disp", el:["Fe","Cu"], cond:"PCB etching"},
  {eq:"2Fe^3+ + 2I^- -> 2Fe^2+ + I2", cat:"disp", el:["Fe","I"]},
  {eq:"2Fe^2+ + Cl2 -> 2Fe^3+ + 2Cl^-", cat:"disp", el:["Fe","Cl"]},
  {eq:"TiCl4 + 2Mg -> Ti + 2MgCl2", cat:"disp", el:["Ti","Cl","Mg"], cond:"Kroll process"},
  {eq:"Cr2O3 + 2Al -> Al2O3 + 2Cr", cat:"disp", el:["Cr","O","Al"], cond:"thermite, Δ"},
  {eq:"2VO2^+ + Zn + 4H^+ -> 2VO^2+ + Zn^2+ + 2H2O", cat:"disp", el:["V","O","Zn","H"], cond:"vanadium +5 → +4"},

  // --- Heavier p-block (groups 13–17) ---
  {eq:"2Al + 2NaOH + 6H2O -> 2NaAl(OH)4 + 3H2", cat:"pblock", el:["Al","Na","O","H"], cond:"amphoteric"},
  {eq:"Al2O3 + 2NaOH + 3H2O -> 2NaAl(OH)4", cat:"pblock", el:["Al","Na","O","H"], cond:"amphoteric oxide"},
  {eq:"2Al + 3Cl2 -> 2AlCl3", cat:"pblock", el:["Al","Cl"]},
  {eq:"SiO2 + 2NaOH -> Na2SiO3 + H2O", cat:"pblock", el:["Si","O","Na","H"], cond:"acidic oxide"},
  {eq:"SiCl4 + 2H2O -> SiO2 + 4HCl", cat:"pblock", el:["Si","Cl","H","O"], cond:"hydrolysis"},
  {eq:"PbO2 + 4HCl -> PbCl2 + Cl2 + 2H2O", cat:"pblock", el:["Pb","O","H","Cl"], cond:"PbO₂ as oxidant"},
  {eq:"SnO2 + 2C -> Sn + 2CO", cat:"pblock", el:["Sn","O","C"], cond:"tin extraction"},
  {eq:"Sn^2+ + 2Fe^3+ -> Sn^4+ + 2Fe^2+", cat:"pblock", el:["Sn","Fe"], cond:"Sn(II) reductant"},
  {eq:"P4 + 5O2 -> P4O10", cat:"pblock", el:["P","O"]},
  {eq:"P4O10 + 6H2O -> 4H3PO4", cat:"pblock", el:["P","O","H"]},
  {eq:"2P + 3Cl2 -> 2PCl3", cat:"pblock", el:["P","Cl"]},
  {eq:"PCl3 + Cl2 -> PCl5", cat:"pblock", el:["P","Cl"]},
  {eq:"PCl5 + 4H2O -> H3PO4 + 5HCl", cat:"pblock", el:["P","Cl","H","O"], cond:"full hydrolysis"},
  {eq:"PCl5 + H2O -> POCl3 + 2HCl", cat:"pblock", el:["P","Cl","O","H"], cond:"partial hydrolysis"},
  {eq:"SO2 + H2O -> H2SO3", cat:"pblock", el:["S","O","H"]},
  {eq:"SO2 + 2H2S -> 3S + 2H2O", cat:"pblock", el:["S","H","O"], cond:"Claus reaction"},
  {eq:"2H2S + 3O2 -> 2SO2 + 2H2O", cat:"pblock", el:["H","S","O"]},
  {eq:"Na2S2O3 + 2HCl -> 2NaCl + S + SO2 + H2O", cat:"pblock", el:["Na","S","O","Cl","H"], cond:"rate-of-reaction expt"},
  {eq:"Cl2 + H2O <=> HCl + HOCl", cat:"pblock", el:["Cl","H","O"], cond:"chlorine water, disprop."},
  {eq:"Cl2 + 2NaOH -> NaCl + NaClO + H2O", cat:"pblock", el:["Cl","Na","O","H"], cond:"cold dilute, disprop."},
  {eq:"3Cl2 + 6NaOH -> 5NaCl + NaClO3 + 3H2O", cat:"pblock", el:["Cl","Na","O","H"], cond:"hot conc., disprop."},
  {eq:"NaCl + H2SO4 -> NaHSO4 + HCl", cat:"pblock", el:["Na","Cl","H","S","O"], cond:"halide test"},
  {eq:"2NaBr + 2H2SO4 -> Na2SO4 + Br2 + SO2 + 2H2O", cat:"pblock", el:["Na","Br","H","S","O"], cond:"halide test"},
  {eq:"8NaI + 5H2SO4 -> 4Na2SO4 + 4I2 + H2S + 4H2O", cat:"pblock", el:["Na","I","H","S","O"], cond:"halide test"}
];
/* ---- Qualifying set: exactly two reactants after dropping spectators ------ */
const QUAL = [];
R.filter(r=>!r.skip).forEach(r=>{
  const p = parseReaction(r.eq);
  const real = p.reactants.filter(x=>!SPECT.has(x.sp));
  const hadSpect = p.reactants.some(x=>SPECT.has(x.sp));
  if(real.length!==2) return;                                  // curriculum: 2 reactants only
  if(real.some(x=>molarMass(x.sp)==null)) return;              // skip if any mass is unknown
  QUAL.push({
    eq:r.eq, cat:r.cat, el:r.el, cond:r.cond||"", equil:p.equil,
    A:real[0], B:real[1], hadSpect,
    search:(r.eq+" "+r.el.join(" ")+" "+(r.cond||"")+" "+CAT[r.cat].label).toLowerCase()
  });
});
QUAL.forEach((q,i)=>q.id=i);

/* ---- Limiting-reactant maths (pure — returns raw numbers, no DOM) --------
   For aA + bB -> …, the amount of B needed to use up all of A is n(A)·b/a.
   Compare n/coefficient for each reactant; the smaller one is limiting.      */
function computeLimiting(q, mA, mB){
  const A=q.A, B=q.B, a=A.coef, b=B.coef;
  const MA=molarMass(A.sp), MB=molarMass(B.sp);
  const nA=mA/MA, nB=mB/MB;
  const nBneed=nA*(b/a);                 // B required to consume all A
  const ratioA=nA/a, ratioB=nB/b;
  const tol=1e-9*Math.max(ratioA,ratioB);
  const enough = nB >= nBneed - tol;     // is there enough B for all the A?
  let tie=false, limiting=null, excess=null, leftMol=0, leftMass=0;
  if(Math.abs(ratioA-ratioB)<=tol){ tie=true; }
  else if(ratioA<ratioB){ limiting=A; excess=B; leftMol=nB-nBneed;            leftMass=leftMol*MB; }
  else                  { limiting=B; excess=A; leftMol=nA-nB*(a/b);          leftMass=leftMol*MA; }
  return {A,B,a,b,MA,MB,nA,nB,nBneed,ratioA,ratioB,tie,enough,limiting,excess,leftMol,leftMass};
}
