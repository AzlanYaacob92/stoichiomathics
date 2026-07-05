/* ============================================================================
   app.js  —  presentation layer
   Owns: page state, the PERIODIC-TABLE filter (table-only; no text search),
   the hidden-by-default reaction picker, the calculator with three input
   methods per reactant (mass / concentration×volume / gas volume), the worked
   method, and all DOM wiring.
   Depends on chemistry.js (AM, CAT, QUAL, MOLAR_VOL, fmtEq, fmtFormula,
   molarMass, massParts, computeLimiting).
   ========================================================================== */

/* ---- Display formatting -------------------------------------------------- */
function sig(x,n){ n=n||4; if(x===0)return "0"; if(!isFinite(x))return "—"; return Number(x.toPrecision(n)).toString(); }
const mm1 = x => x.toFixed(1);

/* ---- Periodic-table layout (periods 1–6, f-block omitted) ---------------- */
const PT = [
  ["H",1,1,1],["He",2,1,18],
  ["Li",3,2,1],["Be",4,2,2],["B",5,2,13],["C",6,2,14],["N",7,2,15],["O",8,2,16],["F",9,2,17],["Ne",10,2,18],
  ["Na",11,3,1],["Mg",12,3,2],["Al",13,3,13],["Si",14,3,14],["P",15,3,15],["S",16,3,16],["Cl",17,3,17],["Ar",18,3,18],
  ["K",19,4,1],["Ca",20,4,2],["Sc",21,4,3],["Ti",22,4,4],["V",23,4,5],["Cr",24,4,6],["Mn",25,4,7],["Fe",26,4,8],["Co",27,4,9],["Ni",28,4,10],["Cu",29,4,11],["Zn",30,4,12],["Ga",31,4,13],["Ge",32,4,14],["As",33,4,15],["Se",34,4,16],["Br",35,4,17],["Kr",36,4,18],
  ["Rb",37,5,1],["Sr",38,5,2],["Y",39,5,3],["Zr",40,5,4],["Nb",41,5,5],["Mo",42,5,6],["Tc",43,5,7],["Ru",44,5,8],["Rh",45,5,9],["Pd",46,5,10],["Ag",47,5,11],["Cd",48,5,12],["In",49,5,13],["Sn",50,5,14],["Sb",51,5,15],["Te",52,5,16],["I",53,5,17],["Xe",54,5,18],
  ["Cs",55,6,1],["Ba",56,6,2],["La",57,6,3],["Hf",72,6,4],["Ta",73,6,5],["W",74,6,6],["Re",75,6,7],["Os",76,6,8],["Ir",77,6,9],["Pt",78,6,10],["Au",79,6,11],["Hg",80,6,12],["Tl",81,6,13],["Pb",82,6,14],["Bi",83,6,15],["Po",84,6,16],["At",85,6,17],["Rn",86,6,18]
];
const ZBY = {}; PT.forEach(([s,z])=>ZBY[s]=z);
const ACTIVE = new Set(); QUAL.forEach(q=>q.el.forEach(e=>ACTIVE.add(e)));

/* ---- State --------------------------------------------------------------- */
function freshInput(){ return { method:"mass", mass:"", conc:"", cvol:"", cvolUnit:"cm3", gvol:"", gvolUnit:"dm3", cond:"RTP" }; }
const state = {
  mode:"learn",
  cat:"all",
  els:new Set(),
  matchMode:"all",
  sel:null,
  inA:freshInput(), inB:freshInput(),
  revealed:new Set(), guess:null
};
const MODE_LABEL = { learn:"Learning", test:"Testing", verify:"Verify" };

/* ---- Build the periodic table ------------------------------------------- */
const ptable = document.getElementById("ptable");
PT.forEach(([sym,z,p,g])=>{
  const cell=document.createElement("div");
  const on=ACTIVE.has(sym);
  cell.className="cell "+(on?"on":"off");
  cell.style.gridColumn=g; cell.style.gridRow=p;
  cell.dataset.sym=sym;
  cell.innerHTML='<span class="z">'+z+'</span>'+sym;
  if(on) cell.addEventListener("click",()=>toggleEl(sym));
  ptable.appendChild(cell);
});
const note=document.createElement("div");
note.className="ftag"; note.style.gridRow=8; note.textContent="f-block omitted";
ptable.appendChild(note);

/* ---- Category select (only categories present in the qualifying set) ----- */
const catsel = document.getElementById("catsel");
const presentCats = [...new Set(QUAL.map(q=>q.cat))];
catsel.innerHTML = '<option value="all">All reaction types</option>' +
  Object.entries(CAT).filter(([k])=>presentCats.includes(k)).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join("");

/* ---- Filtering (element-only; the bank is never text-searchable) --------- */
function catalogPass(q){
  if(state.cat!=="all" && q.cat!==state.cat) return false;
  if(state.els.size){
    const arr=[...state.els];
    if(state.matchMode==="all"){ if(!arr.every(e=>q.el.includes(e))) return false; }
    else { if(!arr.some(e=>q.el.includes(e))) return false; }
  }
  return true;
}

function renderCatalog(){
  document.querySelectorAll(".cell.on, .cell.sel").forEach(c=>{
    const picked = state.els.has(c.dataset.sym);
    c.classList.toggle("sel", picked);
    if(!picked) c.classList.add("on");
  });
  const sc = document.getElementById("selchips");
  sc.innerHTML = [...state.els].sort((a,b)=>ZBY[a]-ZBY[b]).map(s=>
    `<button class="selchip" data-rm="${s}">${s}<span>×</span></button>`).join("");
  sc.querySelectorAll("[data-rm]").forEach(b=>b.addEventListener("click",()=>toggleEl(b.dataset.rm)));

  const filtering = state.els.size>0;
  const list = document.getElementById("list");
  const count = document.getElementById("count");

  if(!filtering){
    count.innerHTML = "";
    list.innerHTML = '<div class="empty">Tap one or more <b>lit elements</b> in the table above to surface a matching reaction — then pick it to open the calculator.<br><span style="color:var(--faint)">Dim elements don\u2019t appear in any two-reactant reaction.</span></div>';
    return;
  }

  const out = QUAL.filter(catalogPass);
  count.innerHTML = out.length ? `<b>${out.length}</b> matching reaction${out.length>1?"s":""}` : "";
  if(!out.length){
    list.innerHTML = '<div class="empty">No two-reactant reaction contains '+
      (state.matchMode==="all" && state.els.size>1 ? "<b>all</b> of those elements together" : "that combination")+
      '.<br>Try <b>Match any</b>, remove an element, or clear the filters.</div>';
    return;
  }
  list.innerHTML = out.map(q=>{
    const c = CAT[q.cat];
    return `<div class="rx ${state.sel===q.id?'sel':''}" data-id="${q.id}">
      <div class="idx">${q.id+1}</div>
      <div class="rxbody">
        <div class="eq">${fmtEq(q.eq)}</div>
        <div class="meta">
          <span class="tag" style="background:${c.color}22;color:${c.color};border:1px solid ${c.color}55">${c.label}</span>
          ${q.cond?`<span class="cond">${q.cond}</span>`:""}
          ${q.hadSpect?`<span class="cond" style="color:var(--warn)">H⁺/OH⁻ omitted</span>`:""}
        </div>
      </div>
      <div class="pick">${state.sel===q.id?'Selected':'Use →'}</div>
    </div>`;
  }).join("");
  list.querySelectorAll("[data-id]").forEach(el=>el.addEventListener("click",()=>selectReaction(+el.dataset.id)));
}

function toggleEl(sym){
  if(state.els.has(sym)) state.els.delete(sym); else state.els.add(sym);
  renderCatalog();
}

/* ---- Amount → moles ------------------------------------------------------ */
function molesOf(inp, sp){
  if(inp.method==="mass"){ const m=parseFloat(inp.mass), M=molarMass(sp); return (m>0)? m/M : NaN; }
  if(inp.method==="conc"){ const c=parseFloat(inp.conc); let V=parseFloat(inp.cvol); if(!(c>0)||!(V>0))return NaN; if(inp.cvolUnit==="cm3")V/=1000; return c*V; }
  if(inp.method==="gas"){ let V=parseFloat(inp.gvol); if(!(V>0))return NaN; if(inp.gvolUnit==="cm3")V/=1000; return V/MOLAR_VOL[inp.cond]; }
  return NaN;
}

/* ---- Reaction selection + input builder ---------------------------------- */
function selectReaction(id){
  state.sel = id; state.inA=freshInput(); state.inB=freshInput(); state.revealed.clear(); state.guess=null;
  const q = QUAL[id];
  document.getElementById("calc").classList.remove("hidden");
  document.getElementById("calcEq").innerHTML = fmtEq(q.eq);
  document.getElementById("calcNote").innerHTML = q.hadSpect
    ? `<div class="note"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>
        <span>H⁺ (or OH⁻) is supplied in excess and is <b>not</b> compared here — the limiting reactant is decided between <b>${fmtFormula(q.A.sp)}</b> and <b>${fmtFormula(q.B.sp)}</b> only.</span></div>`
    : "";
  renderInputs();
  renderCatalog(); renderSteps();
  const calcEl=document.getElementById("calc");
  if(calcEl.scrollIntoView) calcEl.scrollIntoView({behavior:"smooth",block:"nearest"});
}

function methodSelect(side, inp){
  const opts=[["mass","Mass (g)"],["conc","Conc. × volume"],["gas","Gas volume"]];
  return `<select class="msel" data-side="${side}" data-role="method" aria-label="measurement method">`+
    opts.map(([v,l])=>`<option value="${v}" ${inp.method===v?"selected":""}>${l}</option>`).join("")+`</select>`;
}
function fieldsFor(side, inp, sp){
  if(inp.method==="mass"){
    const M=molarMass(sp);
    return `<div class="hint">moles = mass ÷ M &nbsp;·&nbsp; M = ${mm1(M)} g·mol⁻¹</div>
      <div class="massrow"><input type="number" min="0" step="any" inputmode="decimal" placeholder="mass" value="${inp.mass}" data-side="${side}" data-role="mass"><span class="unit">g</span></div>`;
  }
  if(inp.method==="conc"){
    return `<div class="hint">moles = concentration × volume</div>
      <div class="massrow"><input type="number" min="0" step="any" inputmode="decimal" placeholder="concentration" value="${inp.conc}" data-side="${side}" data-role="conc"><span class="unit">mol dm⁻³</span></div>
      <div class="massrow"><input type="number" min="0" step="any" inputmode="decimal" placeholder="volume" value="${inp.cvol}" data-side="${side}" data-role="cvol">
        <select class="uSel" data-side="${side}" data-role="cvolUnit"><option value="cm3" ${inp.cvolUnit==="cm3"?"selected":""}>cm³</option><option value="dm3" ${inp.cvolUnit==="dm3"?"selected":""}>dm³</option></select></div>`;
  }
  return `<div class="hint">moles = gas volume ÷ molar volume</div>
    <div class="massrow"><input type="number" min="0" step="any" inputmode="decimal" placeholder="gas volume" value="${inp.gvol}" data-side="${side}" data-role="gvol">
      <select class="uSel" data-side="${side}" data-role="gvolUnit"><option value="dm3" ${inp.gvolUnit==="dm3"?"selected":""}>dm³</option><option value="cm3" ${inp.gvolUnit==="cm3"?"selected":""}>cm³</option></select></div>
    <div class="massrow"><select class="uSel wide" data-side="${side}" data-role="cond"><option value="RTP" ${inp.cond==="RTP"?"selected":""}>RTP · 24.0 dm³ mol⁻¹</option><option value="STP" ${inp.cond==="STP"?"selected":""}>STP · 22.4 dm³ mol⁻¹</option></select></div>`;
}
function renderInputs(){
  const q=QUAL[state.sel];
  const cards=[["a",state.inA,q.A],["b",state.inB,q.B]].map(([side,inp,x])=>
    `<div class="massfield">
      <div class="who">${fmtFormula(x.sp)}${x.coef>1?` <span class="cf">coeff ${x.coef}</span>`:""}</div>
      <div class="methodrow">${methodSelect(side,inp)}</div>
      ${fieldsFor(side,inp,x.sp)}
    </div>`).join("");
  document.getElementById("inputs").innerHTML=cards;
  wireInputs();
}
function inpFor(side){ return side==="a"?state.inA:state.inB; }
function wireInputs(){
  // method change reshapes the fields → rebuild inputs
  document.querySelectorAll('#inputs [data-role="method"]').forEach(sel=>sel.addEventListener("change",e=>{
    inpFor(e.target.dataset.side).method=e.target.value; state.guess=null; renderInputs(); renderSteps();
  }));
  // numeric typing: update state only (keep focus)
  document.querySelectorAll('#inputs input[data-role]').forEach(inp=>inp.addEventListener("input",e=>{
    inpFor(e.target.dataset.side)[e.target.dataset.role]=e.target.value; state.guess=null; renderSteps();
  }));
  // unit / condition selects: update state, no rebuild needed
  document.querySelectorAll('#inputs select.uSel').forEach(sel=>sel.addEventListener("change",e=>{
    inpFor(e.target.dataset.side)[e.target.dataset.role]=e.target.value; state.guess=null; renderSteps();
  }));
}

/* ---- Small step builders ------------------------------------------------- */
function mmBlock(sp){
  const parts = massParts(sp), M = molarMass(sp);
  const body = parts.map((p,i)=>{
    const term = (p.n>1? p.n+" &times; ":"") + mm1(p.a);
    const tag = ` <span style="color:var(--faint)">(${p.el})</span>`;
    return (i===0? "= ":"&nbsp;&nbsp;+ ") + term + tag;
  }).join("<br>");
  return `<span class="math">M(${fmtFormula(sp)})<br>${body}<br>= <b>${mm1(M)}</b> g&middot;mol<sup>&minus;1</sup></span>`;
}
function moleLine(inp, sp){
  if(inp.method==="mass"){ const m=parseFloat(inp.mass),M=molarMass(sp),n=m/M;
    return `n(${fmtFormula(sp)}) = m ÷ M = ${sig(m)} ÷ ${mm1(M)} = <b>${sig(n)}</b> mol`; }
  if(inp.method==="conc"){ const c=parseFloat(inp.conc); let Vr=parseFloat(inp.cvol),V=inp.cvolUnit==="cm3"?Vr/1000:Vr,n=c*V;
    const conv=inp.cvolUnit==="cm3"?`${sig(Vr)} cm³ = ${sig(V)} dm³, `:"";
    return `n(${fmtFormula(sp)}) = c × V = ${conv}${sig(c)} × ${sig(V)} = <b>${sig(n)}</b> mol`; }
  let Vr=parseFloat(inp.gvol),V=inp.gvolUnit==="cm3"?Vr/1000:Vr,Vm=MOLAR_VOL[inp.cond],n=V/Vm;
  const conv=inp.gvolUnit==="cm3"?`${sig(Vr)} cm³ = ${sig(V)} dm³, `:"";
  return `n(${fmtFormula(sp)}) = V ÷ V<sub>m</sub> = ${conv}${sig(V)} ÷ ${Vm.toFixed(1)} = <b>${sig(n)}</b> mol <span style="color:var(--faint)">(${inp.cond})</span>`;
}
function reveal(key, label){
  return `<div class="reveal" data-reveal="${key}">
    <span class="rl">${label}</span>
    <span class="rk">Reveal <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></span>
  </div>`;
}
function stepShell(num, title, bodyHTML, muted){
  return `<div class="step ${muted?'muted':''}"><div class="snum">${num}</div><div class="sbody">
    <div class="stitle">${title}</div>${bodyHTML}</div></div>`;
}

/* ---- Worked method (learn / test / verify) ------------------------------- */
function renderSteps(){
  const q = QUAL[state.sel]; if(!q) return;
  document.getElementById("modePill").textContent = MODE_LABEL[state.mode];
  const gated = state.mode==="test";
  document.getElementById("revealAll").style.display = gated ? "inline-block" : "none";

  const A=q.A, B=q.B, a=A.coef, b=B.coef;
  const MA=molarMass(A.sp), MB=molarMass(B.sp);
  const nA=molesOf(state.inA,A.sp), nB=molesOf(state.inB,B.sp);
  const haveMoles = isFinite(nA)&&nA>0&&isFinite(nB)&&nB>0;
  const out=[];

  // Step 1 — the two reactants
  out.push(stepShell(1, "The two reactants",
    `<div class="swork">Decide which of <b>${fmtFormula(A.sp)}</b> and <b>${fmtFormula(B.sp)}</b> runs out first.
     Their mole ratio in the equation is <b>${a} : ${b}</b>.${q.hadSpect?` H⁺/OH⁻ is in excess and ignored.`:""}</div>`));

  // Step 2 — molar masses (only for reactants entered by mass)
  const massSides=[A,B].filter((x,i)=>(i===0?state.inA:state.inB).method==="mass");
  let step2body, step2title;
  if(massSides.length===0){
    step2title = "Molar masses";
    step2body = `<div class="swork">Neither amount is given as a mass, so no molar mass is needed to reach the moles.</div>`;
  } else if(state.mode==="verify"){
    step2title = "Molar masses";
    step2body = `<div class="ans">`+massSides.map(x=>`M(<span>${fmtFormula(x.sp)}</span>) = <span class="v">${mm1(molarMass(x.sp))}</span> g·mol⁻¹`).join(" &nbsp;·&nbsp; ")+`</div>`;
  } else {
    step2title = "Work out the molar mass"+(massSides.length>1?"es":"");
    step2body = `<div class="swork">`+massSides.map(x=>mmBlock(x.sp)).join("")+`</div>`;
  }
  out.push(stepShell(2, step2title, step2body));

  if(!haveMoles){
    out.push(`<div class="prompt">Enter the required value(s) for <b>both</b> reactants above — choose Mass, Concentration × volume, or Gas volume for each — to work out the moles and the limiting reactant.</div>`);
    document.getElementById("stepsOut").innerHTML = out.join("");
    wireReveals();
    return;
  }

  const res = computeLimiting(q, nA, nB);
  const { nBneed, tie, enough, limiting, excess, leftMol, leftMass } = res;

  // Step 3 — amounts to moles
  if(state.mode==="verify"){
    out.push(stepShell(3,"Moles of each reactant",
      `<div class="ans">n(<span>${fmtFormula(A.sp)}</span>) = <span class="v">${sig(nA)}</span> mol &nbsp;·&nbsp; n(<span>${fmtFormula(B.sp)}</span>) = <span class="v">${sig(nB)}</span> mol</div>`));
  } else {
    out.push(stepShell(3,"Convert each amount to moles",
      `<div class="swork">
        <span class="math">${moleLine(state.inA,A.sp)}</span>
        <span class="math">${moleLine(state.inB,B.sp)}</span>
      </div>`));
  }

  // Step 4 — mole ratio
  const ratioBody = state.mode==="verify"
    ? `<div class="ans">${fmtFormula(A.sp)} : ${fmtFormula(B.sp)} = <span class="v">${a} : ${b}</span></div>`
    : `<div class="swork">From the balanced equation, ${fmtFormula(A.sp)} and ${fmtFormula(B.sp)} react in the ratio
        <b>${a} : ${b}</b>. So every <b>${a}</b> mol of ${fmtFormula(A.sp)} needs <b>${b}</b> mol of ${fmtFormula(B.sp)}.</div>`;
  if(gated && !state.revealed.has("ratio")){
    out.push(stepShell(4,"Read off the mole ratio", reveal("ratio","Ratio from the balanced equation — try it first"), true));
  } else {
    out.push(stepShell(4,"Read off the mole ratio", ratioBody));
  }

  // Step 5 — compare needed vs available
  const cmpWord = tie ? "exactly equal to" : (enough? "less than (or equal to)" : "more than");
  const compareBody = state.mode==="verify"
    ? `<div class="ans">need n(${fmtFormula(B.sp)}) = <span class="v">${sig(nBneed)}</span> mol; have <span class="v">${sig(nB)}</span> mol → needed is <span class="v">${tie?"equal to":(enough?"≤":">")}</span> available</div>`
    : `<div class="swork">
        To react with all <b>${sig(nA)}</b> mol of ${fmtFormula(A.sp)} you would need:
        <span class="math">n(${fmtFormula(B.sp)}) needed = n(${fmtFormula(A.sp)}) × ${b}/${a} = ${sig(nA)} × ${sig(b/a)} = <b>${sig(nBneed)}</b> mol</span>
        You actually have <b>${sig(nB)}</b> mol of ${fmtFormula(B.sp)}.
        The amount needed (${sig(nBneed)} mol) is <b>${cmpWord}</b> the amount available (${sig(nB)} mol).</div>`;
  if(gated && !state.revealed.has("compare")){
    out.push(stepShell(5,"Compare: how much is needed vs available", reveal("compare","Needed amount vs available amount"), true));
  } else {
    out.push(stepShell(5,"Compare: how much is needed vs available", compareBody));
  }

  // Step 6 — verdict
  const verdictInner = tie
    ? `<div class="verdict eq"><div class="vt">Exactly stoichiometric</div>
        Neither reactant is in excess — both ${fmtFormula(A.sp)} and ${fmtFormula(B.sp)} are used up completely.</div>`
    : `<div class="verdict lim">
        <div class="vt">Limiting reactant: <span class="chip lim">${fmtFormula(limiting.sp)}</span></div>
        <b>${fmtFormula(limiting.sp)}</b> runs out first, so it controls how much product forms.
        <b>${fmtFormula(excess.sp)}</b> is in <span class="chip exc">excess</span> — about
        <b>${sig(leftMass)} g</b> (${sig(leftMol)} mol) of it is left over once the reaction stops.</div>`;
  const verdictAns = tie
    ? `<div class="ans">Limiting: <span class="v">neither (exact)</span></div>`
    : `<div class="ans">Limiting: <span class="v">${fmtFormula(limiting.sp)}</span> &nbsp;·&nbsp; Excess: <span class="v">${fmtFormula(excess.sp)}</span> (<span class="v">${sig(leftMass)}</span> g left)</div>`;

  if(state.mode==="verify"){
    out.push(stepShell(6,"Conclusion", verdictAns));
  } else if(gated && !state.revealed.has("verdict")){
    if(tie){
      out.push(stepShell(6,"Which reactant is limiting?", reveal("verdict","Reveal the conclusion"), true));
    } else if(state.guess){
      const correct = state.guess===limiting.sp;
      const g = `<div class="guess">
        ${[A,B].map(x=>{
          const cls = x.sp===state.guess ? (x.sp===limiting.sp?"ok":"no") : (x.sp===limiting.sp?"ok":"");
          return `<button class="gbtn ${cls}" disabled>${fmtFormula(x.sp)}</button>`;
        }).join("")}
        <span style="align-self:center;font-size:13px;color:${correct?'var(--lim)':'#f4b4b4'};font-weight:700">${correct?"Correct ✓":"Not quite — see below"}</span>
      </div>${verdictInner}`;
      out.push(stepShell(6,"Which reactant is limiting?", g));
    } else {
      const g = `<div class="gprompt">Make a prediction, then it reveals:</div>
        <div class="guess">${[A,B].map(x=>`<button class="gbtn" data-guess="${x.sp}">${fmtFormula(x.sp)}</button>`).join("")}</div>
        ${reveal("verdict","…or just reveal the answer")}`;
      out.push(stepShell(6,"Which reactant is limiting?", g, true));
    }
  } else {
    out.push(stepShell(6,"Conclusion", verdictInner));
  }

  document.getElementById("stepsOut").innerHTML = out.join("");
  wireReveals();
}

function wireReveals(){
  document.querySelectorAll("[data-reveal]").forEach(el=>el.addEventListener("click",()=>{
    state.revealed.add(el.dataset.reveal); renderSteps();
  }));
  document.querySelectorAll("[data-guess]").forEach(el=>el.addEventListener("click",()=>{
    state.guess=el.dataset.guess; renderSteps();
  }));
}

/* ---- Wiring -------------------------------------------------------------- */
document.querySelectorAll("#modes .mode").forEach(b=>b.addEventListener("click",()=>{
  state.mode=b.dataset.mode; state.revealed.clear(); state.guess=null;
  document.querySelectorAll("#modes .mode").forEach(x=>x.classList.toggle("active",x===b));
  renderSteps();
}));
document.querySelectorAll("#matchmode button").forEach(b=>b.addEventListener("click",()=>{
  state.matchMode=b.dataset.match;
  document.querySelectorAll("#matchmode button").forEach(x=>x.classList.toggle("active",x===b));
  renderCatalog();
}));
document.getElementById("revealAll").addEventListener("click",()=>{
  ["ratio","compare","verdict"].forEach(k=>state.revealed.add(k)); renderSteps();
});
catsel.addEventListener("change",e=>{ state.cat=e.target.value; renderCatalog(); });
document.getElementById("clear").addEventListener("click",()=>{
  state.cat="all"; state.els.clear(); state.matchMode="all";
  catsel.value="all";
  document.querySelectorAll("#matchmode button").forEach(x=>x.classList.toggle("active",x.dataset.match==="all"));
  renderCatalog();
});

renderCatalog();
