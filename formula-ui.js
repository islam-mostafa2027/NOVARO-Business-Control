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
  const countId=input.getAttribute("data-count-id"),view=window.__stocktakeView;
  if(countId&&view?.branch_id&&view?.id&&view?.session?.status!=="submitted"&&!view.locked)
   return map().inventoryCount(view.branch_id,view.id,countId);
  const roleRow=input.closest("[data-role-row]"),roleId=roleRow?.dataset.roleRow;
  if(roleId&&input.classList.contains("hc-role-count")&&headcountBranchId)
   return map().headcountRequired(root.headcountBranchId,roleId);
  if(input.id==="requiredHeadcountInput"&&root.headcountBranchId&&profile?.role==="owner_admin")
   return map().branchRequiredHeadcount(root.headcountBranchId);
  return null;
 }
 function numberValue(value){
  const raw=clean(value);if(raw==="")return null;
  const n=Number(raw);return Number.isFinite(n)?n:null;
 }
 async function evaluateCell(targetId,initialFormula){
  const formulas={};let frontier=[targetId];
  while(frontier.length){
   const batch=[...new Set(frontier)].filter(id=>!Object.prototype.hasOwnProperty.call(formulas,id));
   frontier=[];
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
  const values=await loader().loadCells([...refs],root.db,map(),adapter());
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
  const selectors=['.sales-report-page [data-sales-metric]','.sales-report-page .sales-statistics-table [data-stat-tickets]','.sales-report-page .sales-statistics-table [data-stat-sales]','.sales-report-page .sales-statistics-table [data-stat-target]','#dailyTipRows [data-tip-amount]','#dailyTipRows [data-dinein-sales]','[data-count-id]','.hc-role-row .hc-role-count','#requiredHeadcountInput'];
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
     const existing=await storage().loadFormulas([id],root.db,map(),adapter());
     const current=existing[id]||"";
     const formula=root.prompt("اكتب المعادلة باستخدام =، وللإشارة إلى خلية أخرى استخدم CELL(\"معرّف الخلية\"):",current);
     if(formula===null)return;
     if(!formula.trim()){
      if(current&&root.confirm("هل تريد حذف المعادلة المحفوظة؟"))await storage().removeFormula(id,root.db,map(),adapter());
      result.hidden=true;button.textContent="ƒx";return;
     }
     await storage().saveFormula(id,formula,root.db,map(),adapter(),engine());
     const calculated=await evaluateCell(id,formula);
     result.textContent="= "+Number(calculated.value).toLocaleString("en-US",{maximumFractionDigits:4});
     result.hidden=false;button.textContent="ƒx ✓";
     result.title="نتيجة محسوبة للعرض فقط؛ القيمة الأصلية لم تتغير";
    }catch(error){
     result.textContent=error?.message||"تعذر حساب المعادلة";result.hidden=false;result.classList.add("novaro-fx-error");button.textContent="ƒx";
    }finally{button.disabled=false;}
   });
  });
 }
 function start(){
  if(root.__NOVAROFormulaUIStarted)return;root.__NOVAROFormulaUIStarted=true;
  decorate();
  const observer=new MutationObserver(()=>decorate());
  observer.observe(root.document.body,{childList:true,subtree:true});
  root.__NOVAROFormulaUIObserver=observer;
 }
 if(root.document){if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",start,{once:true});else start();}
 root.NOVAROFormulaUI=Object.freeze({refresh:decorate});
})(typeof window!=="undefined"?window:globalThis);
