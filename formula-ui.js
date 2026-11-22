/* NOVARO Formula UI
 * Inline Excel-style formula entry. Formulas stay separate from business values.
 * Cell reads continue through the existing source adapter and Supabase RLS.
 */
(function(root){
 "use strict";
 const map=()=>root.NOVAROFormulaCellMap, adapter=()=>root.NOVAROFormulaSourceAdapter;
 const engine=()=>root.NOVAROFormulaEngine, storage=()=>root.NOVAROFormulaStorage;
 const loader=()=>root.NOVAROFormulaDataLoader, runtime=()=>root.NOVAROFormulaRuntime;
 const graph=()=>root.NOVAROFormulaDependencyGraph;
 const SELECTORS=[
  '.sales-report-page [data-sales-metric]',
  '.sales-report-page .sales-statistics-table [data-stat-tickets]',
  '.sales-report-page .sales-statistics-table [data-stat-sales]',
  '.sales-report-page .sales-statistics-table [data-stat-target]',
  '#dailyTipRows [data-tip-amount]','#dailyTipRows [data-dinein-sales]',
  '[data-count-id]','#minStock','.hc-role-row .hc-role-count','#requiredHeadcountInput'
 ];
 const FUNCTIONS=[
  ['SUM','جمع القيم'],['AVERAGE','حساب المتوسط'],['MIN','أصغر قيمة'],
  ['MAX','أكبر قيمة'],['COUNT','عدّ الخلايا الرقمية'],['COUNTA','عدّ الخلايا غير الفارغة'],
  ['IF','تنفيذ شرط'],['ABS','القيمة المطلقة'],['ROUND','تقريب الرقم'],
  ['AND','تحقق من جميع الشروط'],['OR','تحقق من أحد الشروط'],['NOT','عكس الشرط']
 ];
 const clean=v=>String(v??"").replace(/,/g,"").trim();
 function numberValue(value){
  const raw=clean(value);if(raw==="")return null;
  const n=Number(raw);return Number.isFinite(n)?n:null;
 }
 function idFor(input){
  if(!input||!input.matches("input"))return null;
  const month=typeof salesReportSelectedMonth!=="undefined"?salesReportSelectedMonth:null;
  const page=input.closest(".sales-report-page");
  const branch=page?.querySelector(".sales-month-card")?.dataset.salesBranchId;
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
   const branch=root.document.querySelector(".sales-month-card")?.dataset.salesBranchId;
   const sheet=typeof dailyTipSheetCache!=="undefined"?dailyTipSheetCache?.find(x=>x.sheet_key===dailyTipActiveSheetKey):null;
   if(branch&&month&&sheet){
    const field=input.hasAttribute("data-tip-amount")?"tip_amount":input.hasAttribute("data-dinein-sales")?"dinein_sales":null;
    if(field)return map().dailyTipCell(branch,month,sheet.id,Number(tipRow.dataset.dailyTipDay),field);
   }
  }
  if(input.id==="minStock"&&input.dataset.formulaItemId)return map().itemMinimumStock(input.dataset.formulaItemId);
  const countId=input.getAttribute("data-count-id"),view=root.__stocktakeView;
  if(countId&&view?.branch_id&&view?.id&&view?.session?.status!=="submitted"&&!view.locked)
   return map().inventoryCount(view.branch_id,view.id,countId);
  const roleRow=input.closest("[data-role-row]"),roleId=roleRow?.dataset.roleRow;
  if(roleId&&input.classList.contains("hc-role-count")&&typeof headcountBranchId!=="undefined"&&headcountBranchId)
   return map().headcountRequired(headcountBranchId,roleId);
  if(input.id==="requiredHeadcountInput"&&typeof headcountBranchId!=="undefined"&&headcountBranchId&&typeof profile!=="undefined"&&profile?.role==="owner_admin")
   return map().branchRequiredHeadcount(headcountBranchId);
  return null;
 }
 function eligibleInputs(){
  if(!root.document)return [];
  return Array.from(root.document.querySelectorAll(SELECTORS.join(","))).filter(input=>{
   try{return !!idFor(input)&&!input.disabled;}catch(_){return false;}
  });
 }
 function applyVisibleValues(values,formulas={}){
  const next={...values};
  eligibleInputs().forEach(input=>{
   const id=idFor(input);if(!id||Object.prototype.hasOwnProperty.call(formulas,id))return;
   const value=numberValue(input.value);if(value!==null)next[id]=value;
  });
  return next;
 }
 async function evaluateCell(targetId,initialFormula){
  const formulas={};let frontier=initialFormula?[...engine().getDependencies(initialFormula)]:[targetId];
  while(frontier.length){
   const pending=[...new Set(frontier)].filter(id=>!Object.prototype.hasOwnProperty.call(formulas,id));
   const batch=pending.splice(0,300);frontier=pending;
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
  const values=applyVisibleValues(await loader().loadCells([...refs],db,map(),adapter()),formulas);
  const result=runtime().recalculate(formulas,values,{engine:engine(),graph:graph()});
  if(result.errors[targetId])throw new Error(result.errors[targetId]);
  return {value:result.values[targetId],formula:formulas[targetId]||null};
 }

 let editor=null,formulaTargetId=null,formulaTargetLabel="",pickingCell=false;
 const displayByInput=new WeakMap();
 function ensureStyle(){
  if(root.document.getElementById("novaroFormulaEditorStyle"))return;
  const style=root.document.createElement("style");style.id="novaroFormulaEditorStyle";
  style.textContent=
   ".novaro-fx-modal[hidden],.novaro-fx-picker-hint[hidden],.novaro-fx-suggestions[hidden]{display:none!important}" +
   ".novaro-fx-display{position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;pointer-events:none;z-index:3;padding:0 4px;box-sizing:border-box;direction:ltr;unicode-bidi:plaintext;font-weight:700;color:var(--text,#24364b);background:transparent;font-variant-numeric:tabular-nums}" +
   ".novaro-fx-display.is-error{color:#b42318;font-size:10px;white-space:normal;line-height:1.15}" +
   ".novaro-fx-modal{position:fixed;inset:0;z-index:12050;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(10,18,15,.58);backdrop-filter:blur(3px)}" +
   ".novaro-fx-panel{width:min(560px,96vw);max-height:90dvh;overflow:auto;border:1px solid var(--line,#dce5df);border-radius:16px;background:var(--card,#fff);color:var(--text,#20372f);box-shadow:0 18px 60px #0004;padding:16px;display:grid;gap:10px}" +
   ".novaro-fx-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:800;font-size:15px}" +
   ".novaro-fx-close{border:0;background:transparent;color:inherit;font-size:24px;line-height:1;cursor:pointer;padding:2px 7px}" +
   ".novaro-fx-target{font-size:11px;color:var(--muted,#718078);text-align:start}" +
   ".novaro-fx-input{width:100%;min-height:105px;resize:vertical;box-sizing:border-box;border:1px solid var(--line,#dce5df);border-radius:10px;padding:11px;background:var(--surface,#f7faf8);color:var(--text,#20372f);font:14px/1.6 ui-monospace,monospace;direction:ltr;text-align:left;outline:none}" +
   ".novaro-fx-input:focus{border-color:#23845f;box-shadow:0 0 0 3px #23845f20}" +
   ".novaro-fx-suggestions{display:flex;flex-wrap:wrap;gap:6px}" +
   ".novaro-fx-suggestion{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#dce5df);border-radius:8px;padding:6px 9px;background:var(--surface,#f7faf8);color:var(--text,#20372f);font-size:11px;cursor:pointer}" +
   ".novaro-fx-suggestion strong{direction:ltr}" +
   ".novaro-fx-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}" +
   ".novaro-fx-action{border:1px solid var(--line,#dce5df);border-radius:9px;padding:9px 13px;background:var(--surface,#f7faf8);color:var(--text,#20372f);font-size:12px;font-weight:700;cursor:pointer}" +
   ".novaro-fx-action.primary{background:#23845f;border-color:#23845f;color:#fff}" +
   ".novaro-fx-hint{font-size:11px;line-height:1.6;color:var(--muted,#718078)}" +
   ".novaro-fx-picker-hint{position:fixed;z-index:12051;top:12px;left:50%;transform:translateX(-50%);max-width:92vw;padding:10px 14px;border-radius:10px;background:#20372f;color:#fff;font-size:12px;text-align:center;box-shadow:0 5px 20px #0003}" +
   ":root[data-novaro-mode=dark] .novaro-fx-panel{background:#1b2821;color:#e8f0eb;border-color:#40564a}" +
   ":root[data-novaro-mode=dark] .novaro-fx-input,:root[data-novaro-mode=dark] .novaro-fx-suggestion,:root[data-novaro-mode=dark] .novaro-fx-action{background:#24352c;color:#e8f0eb;border-color:#40564a}" +
   "@media(max-width:600px){.novaro-fx-panel{padding:12px;border-radius:13px}.novaro-fx-actions>*{flex:1 1 auto}.novaro-fx-input{min-height:120px;font-size:16px}}";
  root.document.head.appendChild(style);
 }
 function ensureEditor(){
  if(editor)return editor;
  ensureStyle();
  const modal=root.document.createElement("div");modal.className="novaro-fx-modal";modal.hidden=true;
  const panel=root.document.createElement("section");panel.className="novaro-fx-panel";panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");panel.setAttribute("aria-label","محرر المعادلات");
  const heading=root.document.createElement("div");heading.className="novaro-fx-heading";
  const title=root.document.createElement("span");title.textContent="محرر المعادلات";
  const close=root.document.createElement("button");close.type="button";close.className="novaro-fx-close";close.textContent="×";close.setAttribute("aria-label","إغلاق");
  heading.append(title,close);
  const target=root.document.createElement("div");target.className="novaro-fx-target";
  const textarea=root.document.createElement("textarea");textarea.className="novaro-fx-input";textarea.spellcheck=false;textarea.autocomplete="off";textarea.autocapitalize="off";textarea.setAttribute("inputmode","text");textarea.placeholder="اكتب المعادلة، مثال: =SUM(";
  const suggestions=root.document.createElement("div");suggestions.className="novaro-fx-suggestions";
  const hint=root.document.createElement("div");hint.className="novaro-fx-hint";hint.textContent="على الموبايل: اضغط مطولًا على الخلية لفتح محرر المعادلات ولوحة المفاتيح الكاملة. ابدأ بعلامة = واختر الدالة المقترحة. لاختيار خلية من أي صفحة اضغط «اختيار خلية» ثم انتقل للصفحة المطلوبة واضغط على الخلية.";
  const actions=root.document.createElement("div");actions.className="novaro-fx-actions";
  const pick=root.document.createElement("button");pick.type="button";pick.className="novaro-fx-action";pick.textContent="اختيار خلية";
  const cancel=root.document.createElement("button");cancel.type="button";cancel.className="novaro-fx-action";cancel.textContent="إلغاء";
  const save=root.document.createElement("button");save.type="button";save.className="novaro-fx-action primary";save.textContent="حفظ المعادلة";
  actions.append(pick,cancel,save);panel.append(heading,target,textarea,suggestions,hint,actions);modal.appendChild(panel);root.document.body.appendChild(modal);
  const pickerHint=root.document.createElement("div");pickerHint.className="novaro-fx-picker-hint";pickerHint.hidden=true;pickerHint.textContent="اختار الخلية المطلوبة من أي صفحة، أو اضغط Escape للرجوع.";
  root.document.body.appendChild(pickerHint);
  editor={modal,panel,target,textarea,suggestions,hint,pick,cancel,save,close,pickerHint};
  close.addEventListener("click",closeEditor);cancel.addEventListener("click",closeEditor);
  modal.addEventListener("click",event=>{if(event.target===modal)closeEditor();});
  pick.addEventListener("click",beginCellPick);
  save.addEventListener("click",saveEditorFormula);
  textarea.addEventListener("input",updateSuggestions);
  textarea.addEventListener("keydown",event=>{
   if(event.key==="Escape"){event.preventDefault();closeEditor();}
   if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();saveEditorFormula();}
  });
  return editor;
 }
 function openEditor(cellId,initialText,label){
  const ui=ensureEditor();formulaTargetId=cellId;formulaTargetLabel=label||"";
  ui.target.textContent=label||"الخلية المحددة";
  ui.textarea.value=initialText||"=";ui.modal.hidden=false;ui.modal.style.display="flex";
  ui.pickerHint.hidden=true;pickingCell=false;
  updateSuggestions();root.setTimeout(()=>ui.textarea.focus(),0);
 }
 function closeEditor(){
  if(!editor)return;
  pickingCell=false;editor.pickerHint.hidden=true;editor.modal.hidden=true;editor.modal.style.display="none";
  formulaTargetId=null;formulaTargetLabel="";
 }
 function updateSuggestions(){
  if(!editor)return;
  const text=editor.textarea.value,cursor=editor.textarea.selectionStart;
  const prefix=text.slice(0,cursor);
  const match=prefix.match(/(?:^|[=,(+\-*/])\s*([A-Za-z_]*)$/);
  editor.suggestions.textContent="";
  if(!match){editor.suggestions.hidden=true;return;}
  const term=(match[1]||"").toUpperCase();
  const candidates=FUNCTIONS.filter(item=>!term||item[0].startsWith(term)).slice(0,8);
  if(!candidates.length){editor.suggestions.hidden=true;return;}
  editor.suggestions.hidden=false;
  candidates.forEach(([name,description])=>{
   const button=root.document.createElement("button");button.type="button";button.className="novaro-fx-suggestion";
   const strong=root.document.createElement("strong");strong.textContent=name+"()";
   const small=root.document.createElement("span");small.textContent=description;
   button.append(strong,small);
   button.addEventListener("mousedown",event=>event.preventDefault());
   button.addEventListener("click",()=>{
    const before=editor.textarea.value.slice(0,cursor),after=editor.textarea.value.slice(editor.textarea.selectionEnd);
    const start=cursor-(match[1]||"").length;
    editor.textarea.value=before.slice(0,start)+name+"("+after;
    const next=start+name.length+1;editor.textarea.focus();editor.textarea.setSelectionRange(next,next);updateSuggestions();
   });
   editor.suggestions.appendChild(button);
  });
 }
 function beginCellPick(){
  if(!editor||!formulaTargetId)return;
  pickingCell=true;editor.modal.hidden=true;editor.modal.style.display="none";
  editor.pickerHint.hidden=false;
 }
 function quoteCellId(id){return 'CELL("'+String(id).replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'")';}
 function handlePickClick(event){
  if(!pickingCell)return;
  const input=event.target?.closest?.("input");
  if(!input)return;
  let id=null;try{id=idFor(input);}catch(error){console.warn("NOVARO formula cell selection:",error);}
  if(!id)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  const expression=quoteCellId(id),area=editor.textarea,start=area.selectionStart,end=area.selectionEnd;
  area.value=area.value.slice(0,start)+expression+area.value.slice(end);
  const cursor=start+expression.length;area.setSelectionRange(cursor,cursor);
  editor.pickerHint.hidden=true;editor.modal.hidden=false;editor.modal.style.display="flex";pickingCell=false;
  updateSuggestions();area.focus();
 }
 function handlePickerKey(event){
  if(pickingCell&&event.key==="Escape"){
   event.preventDefault();pickingCell=false;editor.pickerHint.hidden=true;editor.modal.hidden=false;editor.modal.style.display="flex";editor.textarea.focus();
  }
 }
 function inputLabel(input){
  const label=input.closest(".field,.sales-metric,.sales-statistics-cell,td")?.querySelector("label,th")?.textContent?.trim();
  return label||input.getAttribute("aria-label")||input.id||"خلية رقمية";
 }
 async function openExistingFormula(input){
  const id=idFor(input);if(!id)return;
  try{
   const existing=await storage().loadFormulas([id],db,map(),adapter());
   openEditor(id,existing[id]||"=",inputLabel(input));
  }catch(error){console.warn("NOVARO formula editor:",error);alert(error?.message||"تعذر فتح محرر المعادلات");}
 }
 function handleCellKeydown(event){
  const input=event.target;
  if(!input?.matches?.("input"))return;
  let id=null;try{id=idFor(input);}catch(_){return;}
  if(!id)return;
  if(event.key==="="&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   event.preventDefault();event.stopPropagation();openEditor(id,"=",inputLabel(input));return;
  }
  if(event.key==="F2"){
   event.preventDefault();event.stopPropagation();openExistingFormula(input);
  }
 }
 let longPressTimer=null,longPressInput=null,longPressStart=null;
 function clearCellLongPress(){
  if(longPressTimer!==null)root.clearTimeout(longPressTimer);
  longPressTimer=null;longPressInput=null;longPressStart=null;
 }
 function handleCellPointerDown(event){
  if(event.pointerType!=="touch"&&event.pointerType!=="pen")return;
  const input=event.target?.closest?.("input");if(!input)return;
  let id=null;try{id=idFor(input);}catch(_){return;}if(!id)return;
  clearCellLongPress();longPressInput=input;longPressStart={x:event.clientX,y:event.clientY};
  longPressTimer=root.setTimeout(()=>{
   const target=longPressInput;if(!target)return;
   longPressTimer=null;target.blur();openExistingFormula(target);
  },650);
 }
 function handleCellPointerMove(event){
  if(longPressTimer===null||!longPressStart)return;
  if(Math.abs(event.clientX-longPressStart.x)>12||Math.abs(event.clientY-longPressStart.y)>12)clearCellLongPress();
 }
 function handleCellPointerEnd(){clearCellLongPress();}
 function handleCellContextMenu(event){
  const input=event.target?.closest?.("input");if(!input)return;
  let id=null;try{id=idFor(input);}catch(_){return;}if(!id)return;
  event.preventDefault();clearCellLongPress();input.blur();openExistingFormula(input);
 }
 function handleCellDoubleClick(event){
  const input=event.target?.closest?.("input");if(!input)return;
  let id=null;try{id=idFor(input);}catch(_){return;}
  if(!id)return;
  event.preventDefault();event.stopPropagation();openExistingFormula(input);
 }
 function displayFormula(input,text,isError){
  let display=displayByInput.get(input);
  const parent=input.parentElement;if(!parent)return;
  if(!display){
   display=root.document.createElement("span");display.className="novaro-fx-display";
   display.dataset.novaroFormulaDisplay="1";parent.appendChild(display);
   const originalPosition=parent.style.position;
   if(!originalPosition||originalPosition==="static"){parent.dataset.novaroFxPositionSet="1";parent.style.position="relative";}
   displayByInput.set(input,{node:display,color:input.style.color,caret:input.style.caretColor,readOnly:input.readOnly,position:originalPosition});
   input.style.color="transparent";input.style.caretColor="transparent";input.readOnly=true;
  }else display=display.node;
  const rect=input.getBoundingClientRect(),parentRect=parent.getBoundingClientRect();
  display.style.left=(rect.left-parentRect.left)+"px";display.style.top=(rect.top-parentRect.top)+"px";
  display.style.width=rect.width+"px";display.style.height=rect.height+"px";
  display.style.font=input.style.font||root.getComputedStyle(input).font;
  display.style.fontSize=isError?"10px":root.getComputedStyle(input).fontSize;
  display.textContent=text;display.classList.toggle("is-error",!!isError);
  display.title=isError?"تعذر حساب المعادلة":"نتيجة المعادلة؛ القيمة الأصلية محفوظة دون تغيير";
 }
 function clearFormulaDisplay(input){
  const state=displayByInput.get(input);if(!state)return;
  state.node.remove();input.style.color=state.color;input.style.caretColor=state.caret;input.readOnly=state.readOnly;
  if(input.parentElement?.dataset.novaroFxPositionSet==="1"){input.parentElement.style.position=state.position||"";delete input.parentElement.dataset.novaroFxPositionSet;}
  displayByInput.delete(input);
 }
 let restoreTimer=0,restoreBusy=false,restoreQueued=false;
 async function restoreVisibleFormulas(){
  if(restoreBusy){restoreQueued=true;return;}
  restoreBusy=true;
  try{
   const cells=new Map();
   eligibleInputs().forEach(input=>{const id=idFor(input);if(id)cells.set(id,input);});
   if(!cells.size)return;
   const formulas={};let frontier=[...cells.keys()];
   while(frontier.length){
    const pending=[...new Set(frontier)].filter(id=>!Object.prototype.hasOwnProperty.call(formulas,id));
    const batch=pending.splice(0,300);frontier=pending;if(!batch.length)break;
    const found=await storage().loadFormulas(batch,db,map(),adapter());Object.assign(formulas,found);
    for(const formula of Object.values(found))for(const dep of engine().getDependencies(formula))if(!Object.prototype.hasOwnProperty.call(formulas,dep))frontier.push(dep);
    if(Object.keys(formulas).length>300)throw new Error("عدد مراجع المعادلات تجاوز الحد الآمن");
   }
   const active=Object.keys(formulas).filter(id=>cells.has(id));
   cells.forEach((input,id)=>{if(!active.includes(id))clearFormulaDisplay(input);});
   if(!active.length)return;
   const refs=new Set(Object.keys(formulas));
   for(const formula of Object.values(formulas))for(const dep of engine().getDependencies(formula))refs.add(dep);
   if(refs.size>300)throw new Error("عدد مراجع المعادلات المعروضة تجاوز الحد الآمن (300)");
   const values=applyVisibleValues(await loader().loadCells([...refs],db,map(),adapter()),formulas);
   const calculated=runtime().recalculate(formulas,values,{engine:engine(),graph:graph()});
   for(const id of active){
    const input=cells.get(id);if(!input)continue;
    const error=calculated.errors[id],value=calculated.results[id];
    const text=error||Number(value).toLocaleString("en-US",{maximumFractionDigits:4});
    displayFormula(input,text,!!error);
   }
  }catch(error){
   console.warn("NOVARO formula refresh:",error);
   const message=error?.message||"تعذر تحديث المعادلات";
   eligibleInputs().forEach(input=>{
    const state=displayByInput.get(input);if(state)displayFormula(input,message,true);
   });
  }finally{
   restoreBusy=false;
   if(restoreQueued){restoreQueued=false;scheduleRestore();}
  }
 }
 function scheduleRestore(){
  restoreQueued=true;if(restoreTimer)root.clearTimeout(restoreTimer);
  restoreTimer=root.setTimeout(()=>{restoreTimer=0;restoreQueued=false;restoreVisibleFormulas();},300);
 }
 async function saveEditorFormula(){
  if(!editor||!formulaTargetId)return;
  const id=formulaTargetId,formula=editor.textarea.value.trim();
  editor.save.disabled=true;editor.save.textContent="جارٍ الحفظ...";
  try{
   if(!formula||formula==="="){
    const existing=await storage().loadFormulas([id],db,map(),adapter());
    if(existing[id]){
     if(!root.confirm("هل تريد حذف المعادلة من هذه الخلية؟"))return;
     await storage().removeFormula(id,db,map(),adapter());
    }
   }else{
    const calculated=await evaluateCell(id,formula);
    await storage().saveFormula(id,formula,db,map(),adapter(),engine());
    if(typeof calculated.value!=="number"||!Number.isFinite(calculated.value))throw new Error("نتيجة المعادلة ليست رقمًا صالحًا");
   }
   closeEditor();scheduleRestore();
  }catch(error){
   editor.hint.textContent=error?.message||"تعذر حفظ المعادلة";
   editor.hint.style.color="#b42318";
  }finally{
   if(editor){editor.save.disabled=false;editor.save.textContent="حفظ المعادلة";}
  }
 }
 function handleCellValueChange(event){
  const input=event?.target;
  if(input?.matches?.("input")){let id=null;try{id=idFor(input);}catch(_){return;}if(id)scheduleRestore();}
 }
 function start(){
  if(root.__NOVAROFormulaUIStarted)return;root.__NOVAROFormulaUIStarted=true;
  ensureStyle();
  root.document.body.addEventListener("keydown",handleCellKeydown,true);
  root.document.body.addEventListener("dblclick",handleCellDoubleClick,true);
  root.document.body.addEventListener("pointerdown",handleCellPointerDown,true);
  root.document.body.addEventListener("pointerup",handleCellPointerEnd,true);
  root.document.body.addEventListener("pointercancel",handleCellPointerEnd,true);
  root.document.body.addEventListener("pointermove",handleCellPointerMove,true);
  root.document.body.addEventListener("contextmenu",handleCellContextMenu,true);
  root.document.body.addEventListener("click",handlePickClick,true);
  root.document.body.addEventListener("keydown",handlePickerKey,true);
  root.document.body.addEventListener("input",handleCellValueChange,true);
  root.document.body.addEventListener("change",handleCellValueChange,true);
  const observer=new MutationObserver(records=>{
   const relevant=records.some(record=>{
    const target=record.target.nodeType===1?record.target:record.target.parentElement;
    if(target?.closest?.(".novaro-fx-modal,.novaro-fx-display,.novaro-fx-picker-hint"))return false;
    return [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType!==1||(!node.matches?.(".novaro-fx-modal,.novaro-fx-display,.novaro-fx-picker-hint")&&!node.closest?.(".novaro-fx-modal,.novaro-fx-display,.novaro-fx-picker-hint")));
   });
   if(relevant)scheduleRestore();
  });
  observer.observe(root.document.body,{childList:true,subtree:true});
  root.NOVAROFormulaUI=Object.freeze({refresh:scheduleRestore,recalculate:restoreVisibleFormulas,openEditor});
  root.__NOVAROFormulaUIObserver=observer;
  scheduleRestore();
 }
 root.NOVAROFormulaUI=Object.freeze({refresh:scheduleRestore,recalculate:restoreVisibleFormulas,openEditor});
 if(root.document){if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",start,{once:true});else start();}
})(typeof window!=="undefined"?window:globalThis);
