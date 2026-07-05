/* ============================================================================
   app.js  —  presentation layer
   Owns: page state, the catalog list, the calculator panel, step titles /
   headings, the per-mode sentence templates, and all DOM wiring.
   Depends on chemistry.js (AM, CAT, QUAL, fmtEq, fmtFormula, molarMass,
   massParts, computeLimiting).  Loaded after chemistry.js.
   ========================================================================== */

/* ---- Display formatting -------------------------------------------------- */
function sig(x,n){ n=n||4; if(x===0)return "0"; if(!isFinite(x))return "—"; return Number(x.toPrecision(n)).toString(); }
const mm1 = x => x.toFixed(1);                       // molar mass, 1 dp

/* ---- State --------------------------------------------------------------- */
const state = { mode:"learn", q:"", cat:"all", sel:null, mA:"", mB:"", revealed:new Set(), guess:null };
const MODE_LABEL = { learn:"Learning", test:"Testing", verify:"Verify" };

/* ---- Catalog ------------------------------------------------------------- */
const catsel = document.getElementById("catsel");
const presentCats = [...new Set(QUAL.map(q=>q.cat))];
catsel.innerHTML = '<option value="all">All reaction types</option>' +
  Object.entries(CAT).filter(([k])=>presentCats.includes(k)).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join("");

function catalogPass(q){
  if(state.cat!=="all" && q.cat!==state.cat) return false;
  if(state.q && !q.search.includes(state.q)) return false;
  return true;
}
function renderCatalog(){
  const out = QUAL.filter(catalogPass);
  document.getElementById("count").innerHTML = `<b>${out.length}</b> of ${QUAL.length} two-reactant reactions`;
  const list = document.getElementById("list");
  if(!out.length){ list.innerHTML = '<div class="empty">No two-reactant reactions match.<br>Try a different element or <b>clear the filters</b>.</div>'; return; }
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

/* ---- Reaction selection + mass inputs ------------------------------------ */
function selectReaction(id){
  state.sel = id; state.mA=""; state.mB=""; state.revealed.clear(); state.guess=null;
  const q = QUAL[id];
  document.getElementById("calc").classList.remove("hidden");
  document.getElementById("calcEq").innerHTML = fmtEq(q.eq);
  document.getElementById("calcNote").innerHTML = q.hadSpect
    ? `<div class="note"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>
        <span>H⁺ (or OH⁻) is supplied in excess and is <b>not</b> compared here — the limiting reactant is decided between <b>${fmtFormula(q.A.sp)}</b> and <b>${fmtFormula(q.B.sp)}</b> only.</span></div>`
    : "";
  document.getElementById("inputs").innerHTML = [q.A,q.B].map((x,k)=>{
    const M = molarMass(x.sp);
    return `<div class="massfield">
      <div class="who">${fmtFormula(x.sp)}</div>
      <div class="mm">M = ${mm1(M)} g·mol⁻¹${x.coef>1?` · coefficient ${x.coef}`:""}</div>
      <div class="massrow">
        <input type="number" min="0" step="any" inputmode="decimal" placeholder="mass" data-side="${k===0?'a':'b'}">
        <span class="unit">g</span>
      </div>
    </div>`;
  }).join("");
  document.querySelectorAll("#inputs input").forEach(inp=>inp.addEventListener("input",e=>{
    if(e.target.dataset.side==='a') state.mA=e.target.value; else state.mB=e.target.value;
    state.guess=null; renderSteps();
  }));
  renderCatalog(); renderSteps();
  const calcEl=document.getElementById("calc");
  if(calcEl.scrollIntoView) calcEl.scrollIntoView({behavior:"smooth",block:"nearest"});
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
  const mA=parseFloat(state.mA), mB=parseFloat(state.mB);
  const haveMass = isFinite(mA)&&mA>0&&isFinite(mB)&&mB>0;
  const out=[];

  // Step 1 — identify the two reactants (framing; always shown)
  out.push(stepShell(1, "The two reactants",
    `<div class="swork">Decide which of <b>${fmtFormula(A.sp)}</b> and <b>${fmtFormula(B.sp)}</b> runs out first.
     Their mole ratio in the equation is <b>${a} : ${b}</b>.${q.hadSpect?` H⁺/OH⁻ is in excess and ignored.`:""}</div>`));

  // Step 2 — molar masses
  if(state.mode==="verify"){
    out.push(stepShell(2,"Molar masses",
      `<div class="ans">M(<span>${fmtFormula(A.sp)}</span>) = <span class="v">${mm1(MA)}</span> g·mol⁻¹ &nbsp;·&nbsp; M(<span>${fmtFormula(B.sp)}</span>) = <span class="v">${mm1(MB)}</span> g·mol⁻¹</div>`));
  } else {
    out.push(stepShell(2,"Work out the molar masses",
      `<div class="swork">${mmBlock(A.sp)}${mmBlock(B.sp)}</div>`));
  }

  if(!haveMass){
    out.push(`<div class="prompt">Enter a mass for <b>both</b> reactants above to work out the moles and the limiting reactant.</div>`);
    document.getElementById("stepsOut").innerHTML = out.join("");
    wireReveals();
    return;
  }

  // Everything below needs the masses → use the chemistry engine
  const res = computeLimiting(q, mA, mB);
  const { nA, nB, nBneed, tie, enough, limiting, excess, leftMol, leftMass } = res;

  // Step 3 — moles
  if(state.mode==="verify"){
    out.push(stepShell(3,"Moles of each reactant",
      `<div class="ans">n(<span>${fmtFormula(A.sp)}</span>) = <span class="v">${sig(nA)}</span> mol &nbsp;·&nbsp; n(<span>${fmtFormula(B.sp)}</span>) = <span class="v">${sig(nB)}</span> mol</div>`));
  } else {
    out.push(stepShell(3,"Convert mass to moles &nbsp;<span style='color:var(--faint);font-weight:600;font-size:12px'>n = m ÷ M</span>",
      `<div class="swork">
        <span class="math">n(${fmtFormula(A.sp)}) = ${sig(mA)} ÷ ${mm1(MA)} = <b>${sig(nA)}</b> mol</span>
        <span class="math">n(${fmtFormula(B.sp)}) = ${sig(mB)} ÷ ${mm1(MB)} = <b>${sig(nB)}</b> mol</span>
      </div>`));
  }

  // Step 4 — mole ratio (gated in testing)
  const ratioBody = state.mode==="verify"
    ? `<div class="ans">${fmtFormula(A.sp)} : ${fmtFormula(B.sp)} = <span class="v">${a} : ${b}</span></div>`
    : `<div class="swork">From the balanced equation, ${fmtFormula(A.sp)} and ${fmtFormula(B.sp)} react in the ratio
        <b>${a} : ${b}</b>. So every <b>${a}</b> mol of ${fmtFormula(A.sp)} needs <b>${b}</b> mol of ${fmtFormula(B.sp)}.</div>`;
  if(gated && !state.revealed.has("ratio")){
    out.push(stepShell(4,"Read off the mole ratio", reveal("ratio","Ratio from the balanced equation — try it first"), true));
  } else {
    out.push(stepShell(4,"Read off the mole ratio", ratioBody));
  }

  // Step 5 — compare needed vs available (gated in testing)
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

  // Step 6 — verdict (gated in testing, with a prediction prompt)
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
    state.guess=el.dataset.guess; renderSteps();   // guess branch renders the verdict itself
  }));
}

/* ---- Wiring -------------------------------------------------------------- */
document.querySelectorAll("#modes .mode").forEach(b=>b.addEventListener("click",()=>{
  state.mode=b.dataset.mode; state.revealed.clear(); state.guess=null;
  document.querySelectorAll("#modes .mode").forEach(x=>x.classList.toggle("active",x===b));
  renderSteps();
}));
document.getElementById("revealAll").addEventListener("click",()=>{
  ["ratio","compare","verdict"].forEach(k=>state.revealed.add(k)); renderSteps();
});
document.getElementById("search").addEventListener("input",e=>{ state.q=e.target.value.trim().toLowerCase(); renderCatalog(); });
catsel.addEventListener("change",e=>{ state.cat=e.target.value; renderCatalog(); });
document.getElementById("clear").addEventListener("click",()=>{
  state.q=""; state.cat="all"; document.getElementById("search").value=""; catsel.value="all"; renderCatalog();
});

renderCatalog();
