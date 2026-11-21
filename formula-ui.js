/* NOVARO Formula UI
 * Formula results are shown beside source inputs only. Original inputs and all
 * existing save/transfer workflows remain untouched.
 */
(function(root){
 "use strict";
 const map=()=>root.NOVAROFormulaCellMap, adapter=()=>root.NOVAROFormulaSourceAdapter;
 const engine=()=>root.NOVAROFormulaEngine, storage=()=>root.NOVAROFormulaStorage;
 const loader=()=>root.NOVAROFormulaDataLoader, runtime=()=>root.NOVAROFormulaRuntime;
 const graph=()=>root.NOVAROFormulaDependencyGraph;
 const clean=v=>String(v??"").replace(/,/g,"").trim();
 function idFor(input){
  if(!input||!input.matches("input"))return null;
  const page=input.closest(".sales-report-page");
  const month=salesReportSelectedMonth, branch=page?.querySelector(".sales-month-card")?.dataset.salesBranchId;
  if(page&&branch&&month){
   const metric=input.dataset.salesMetric;
   if(["sales_target","yesterday_tip","month_to_date_tip"].includes(metric))return map().salesMetric(branch,month,metric);
   const tr=input.closest("tbody tr"),table=input.closest(".sales-statistics-table");
   if(table&&tr){
    const day=Array.from(table.querySelectorAll("tbody tr")).indexOf(tr)+1;
    if(input.hasAttribute("data-stat-target"))return map().statisticsDailyTarget(branch,month,day);
    for(const group of map().statisticsGroups)for(const field of map().statisticsFields){
     if(input.matches('[data-stat-'+field+'="'+group+'"]'))return map().statisticsMetric(branch,month,day,group,field);
    }
   }
  }
  const tipRow=input.closest("#dailyTipRows tr[data-daily-tip-day]");
  const tipCard=input.closest("#dailyTipCard");
  if(tipRow&&tipCard){
   const branch= root.document.querySelector(".sales-month-card")?.dataset.salesBranchId;
   const sheet=dailyTipSheetCache?.find(x=>x.sheet_key===dailyTipActiveSheetKey);
   if(branch&&month&&sheet){
    const field=input.hasAttribute("data-tip-amount")?"tip_amount":input.hasAttribute("data-dinein-sales")?"dinein_sales":null;
    if(field)return map().dailyTipCell(branch,month,sheet.id,Number(tipRow.dataset.dailyTipDay),field);
   }
  }
  if(input.id==="minStock"&&input.dataset.formulaItemId)return map().itemMinimumStock(input.dataset.formulaItemId);
  const countId=input.getAttribute("data-count-id"),view=window.__stocktakeView;
  if(countId&&view?.branch_id&&view?.id&&view?.session?.status!=="submitted"&&!view.locked)
   return map().inventoryCount(view.branch_id,view.id,countId);
  const roleRow=input.closest("[data-role-row]"),roleId=roleRow?.dataset.roleRow;
  if(roleId&&input.classList.contains("hc-role-count")&&headcountBranchId)
   return map().headcountRequired(headcountBranchId,roleId);
  if(input.id==="requiredHeadcountInput"&&headcountBranchId&&profile?.role==="owner_admin")
   return map().branchRequiredHeadcount(headcountBranchId);
  return null;
 }
 function applyVisibleValues(values){
  const next={...values};
  root.document.querySelectorAll(".novaro-fx-wrap").forEach(wrap=>{
   const input=wrap.previousElementSibling,id=idFor(input);if(!id)return;
   const value=numberValue(input.value);if(value!==null)next[id]=value;
  });
  return next;
 }
 function numberValue(value){
  const raw=clean(value);if(raw==="")return null;
  const n=Number(raw);return Number.isFinite(n)?n:null;
 }
 async function evaluateCell(targetId,initialFormula){
  const formulas={};let frontier=initialFormula?[...engine().getDependencies(initialFormula)]:[targetId];
  while(frontier.length){
   const pending=[...new Set(frontier)].filter(id=>!Object.prototype.hasOwnProperty.call(formulas,id));
   const batch=pending.splice(0,300);
   frontier=pending;
   if(!batch.length)break;
   const found=await storage().loadFormulas(batch,db,map(),adapter());
   Object.assign(formulas,found);
   for(const formula of Object.values(found)){
    for(const dep of engine().getDependencies(formula))if(!Object.prototype.hasOwnProperty.call(formulas,dep))frontier.push(dep);
   }
   if(Object.keys(formulas).length>300)throw new Error("عدد مراجع المعادلة تجاوز الحد الآمن (300 خلية)");
  }
  if(initialFormula)formulas[targetId]=initialFormula;
  const refs=new Set([targetId]);
  for(const formula of Object.values(formulas))for(const dep of engine().getDependencies(formula))refs.add(dep);
  if(refs.size>300)throw new Error("المعادلة تحتوي على أكثر من 300 مرجع؛ قلّل عدد المراجع");
  const values=applyVisibleValues(await loader().loadCells([...refs],db,map(),adapter()));
  const result=runtime().recalculate(formulas,values,{engine:engine(),graph:graph()});
  if(result.errors[targetId])throw new Error(result.errors[targetId]);
  return {value:result.values[targetId],formula:formulas[targetId]||null};
 }
 function ensureStyle(){
  if(root.document.getElementById("novaroFormulaUiStyle"))return;
  const style=root.document.createElement("style");style.id="novaroFormulaUiStyle";
  style.textContent=".novaro-fx-wrap{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;margin-inline-start:5px;vertical-align:middle}.novaro-fx-btn{border:1px solid #8b9bb0;border-radius:6px;background:var(--card,#fff);color:var(--text,#24364b);font-size:11px;font-weight:700;padding:3px 6px;cursor:pointer}.novaro-fx-result{font-size:11px;color:var(--muted,#64748b);padding:2px 5px;border-radius:5px;background:rgba(100,116,139,.10);direction:ltr;unicode-bidi:plaintext}.novaro-fx-error{color:#b42318;background:rgba(180,35,24,.08)}";
  root.document.head.appendChild(style);
 }
 function decorate(){
  if(!root.document||!map()||!adapter())return;
  ensureStyle();
  const selectors=['.sales-report-page [data-sales-metric]','.sales-report-page .sales-statistics-table [data-stat-tickets]','.sales-report-page .sales-statistics-table [data-stat-sales]','.sales-report-page .sales-statistics-table [data-stat-target]','#dailyTipRows [data-tip-amount]','#dailyTipRows [data-dinein-sales]','[data-count-id]','#minStock','.hc-role-row .hc-role-count','#requiredHeadcountInput'];
  root.document.querySelectorAll(selectors.join(",")).forEach(input=>{
   if(input.dataset.novaroFormulaDecorated==="1"||!idFor(input))return;
   input.dataset.novaroFormulaDecorated="1";
   const wrap=root.document.createElement("span");wrap.className="novaro-fx-wrap";
   const button=root.document.createElement("button");button.type="button";button.className="novaro-fx-btn";button.textContent="ƒx";button.title="إضافة أو تعديل معادلة لهذه الخلية";
   const result=root.document.createElement("span");result.className="novaro-fx-result";result.hidden=true;
   wrap.append(button,result);input.insertAdjacentElement("afterend",wrap);
   button.addEventListener("click",async()=>{
    const id=idFor(input);if(!id)return;
    button.disabled=true;button.textContent="…";result.hidden=true;result.classList.remove("novaro-fx-error");
    try{
     const existing=await storage().loadFormulas([id],db,map(),adapter());
     const current=existing[id]||"";
     const formula=root.prompt("اكتب المعادلة باستخدام =، وللإشارة إلى خلية أخرى استخدم CELL(\"معرّف الخلية\"):",current);
     if(formula===null)return;
     if(!formula.trim()){
      if(current){
       if(root.confirm("هل تريد حذف المعادلة المحفوظة؟"))await storage().removeFormula(id,db,map(),adapter());
       scheduleRestore();
      }
      result.hidden=true;button.textContent="ƒx";return;
     }
     const calculated=await evaluateCell(id,formula);
     await storage().saveFormula(id,formula,db,map(),adapter(),engine());
     result.textContent="= "+Number(calculated.value).toLocaleString("en-US",{maximumFractionDigits:4});
     result.hidden=false;button.textContent="ƒx ✓";
     result.title="نتيجة محسوبة للعرض فقط؛ القيمة الأصلية لم تتغير";
     scheduleRestore();
    }catch(error){
     result.textContent=error?.message||"تعذر حساب المعادلة";result.hidden=false;result.classList.add("novaro-fx-error");button.textContent="ƒx";
    }finally{button.disabled=false;}
   });
  });
 }
 let restoreTimer=0,restoreBusy=false;
 async function restoreVisibleFormulas(){
  if(restoreBusy)return;
  restoreBusy=true;
  try{
   const cells=new Map();
   root.document.querySelectorAll(".novaro-fx-wrap").forEach(wrap=>{
    const input=wrap.previousElementSibling,id=idFor(input);if(id)cells.set(id,{input,wrap,result:wrap.querySelector(".novaro-fx-result"),button:wrap.querySelector(".novaro-fx-btn")});
   });
   if(!cells.size)return;
   const formulas={};let frontier=[...cells.keys()];
   while(frontier.length){
    const pending=[...new Set(frontier)].filter(id=>!Object.prototype.hasOwnProperty.call(formulas,id));
    const batch=pending.splice(0,300);frontier=pending;
    if(!batch.length)break;
    const found=await storage().loadFormulas(batch,db,map(),adapter());Object.assign(formulas,found);
    for(const formula of Object.values(found))for(const dep of engine().getDependencies(formula))if(!Object.prototype.hasOwnProperty.call(formulas,dep))frontier.push(dep);
    if(Object.keys(formulas).length>300)throw new Error("عدد مراجع المعادلات تجاوز الحد الآمن");
   }
   const active=Object.keys(formulas);if(!active.length)return;
   const refs=new Set(active);
   for(const formula of Object.values(formulas))for(const dep of engine().getDependencies(formula))refs.add(dep);
   if(refs.size>300)throw new Error("عدد مراجع المعادلات المعروضة تجاوز الحد الآمن (300)");
   const values=applyVisibleValues(await loader().loadCells([...refs],db,map(),adapter()));
   const calculated=runtime().recalculate(formulas,values,{engine:engine(),graph:graph()});
   for(const id of active){
    const cell=cells.get(id);if(!cell)continue;
    const error=calculated.errors[id],value=calculated.results[id];
    cell.result.textContent=error||("= "+Number(value).toLocaleString("en-US",{maximumFractionDigits:4}));
    cell.result.hidden=false;cell.result.classList.toggle("novaro-fx-error",!!error);
    cell.button.textContent=error?"ƒx !":"ƒx ✓";
    cell.result.title="نتيجة محسوبة للعرض فقط؛ القيمة الأصلية لم تتغير";
   }
  }catch(error){console.warn("NOVARO formula refresh:",error);}
  finally{restoreBusy=false;}
 }
 function scheduleRestore(){
  if(restoreTimer)root.clearTimeout(restoreTimer);
  restoreTimer=root.setTimeout(()=>{restoreTimer=0;restoreVisibleFormulas();},350);
 }
 function start(){
  if(root.__NOVAROFormulaUIStarted)return;root.__NOVAROFormulaUIStarted=true;
  decorate();
  const observer=new MutationObserver(records=>{
   const relevant=records.some(record=>{
    const target=record.target.nodeType===1?record.target:record.target.parentElement;
    if(target?.closest(".novaro-fx-wrap"))return false;
    const nodes=[...record.addedNodes,...record.removedNodes];
    return nodes.some(node=>node.nodeType!==1||(!node.matches(".novaro-fx-wrap")&&!node.closest(".novaro-fx-wrap")));
   });
   if(relevant){decorate();scheduleRestore();}
  });
  observer.observe(root.document.body,{childList:true,subtree:true});
  root.NOVAROFormulaUI=Object.freeze({refresh:()=>{decorate();scheduleRestore();},recalculate:restoreVisibleFormulas});
  root.__NOVAROFormulaUIObserver=observer;
 }
 if(root.document){if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",start,{once:true});else start();}
 root.NOVAROFormulaUI=Object.freeze({refresh:decorate});
})(typeof window!=="undefined"?window:globalThis);
