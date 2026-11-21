/* NOVARO Formula Source Adapter
 * Converts stable cell IDs into read-only Supabase source descriptors.
 * It does not issue queries, bypass RLS, or write business data.
 */
(function(root){
 "use strict";
 const UUID_PARTS = Object.freeze({
  inventory: 5, item: 3, branch: 3, sales: 4,
  statistics: null, daily_tip: 6, headcount: 4
 });
 const MONTH = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\\d{4}$/;
 const GROUPS = Object.freeze(["dinein","takeaway","delivery","catering"]);
 const METRICS = Object.freeze(["sales_target","yesterday_tip","month_to_date_tip"]);
 const FIELDS = Object.freeze(["tickets","sales"]);
 function invalid(){ throw new Error("معرّف خلية غير مدعوم أو غير صالح"); }
 function describeCell(cellId, cellMap){
  if(!cellMap || typeof cellMap.decode!=="function")throw new Error("خريطة الخلايا غير متاحة");
  let p;
  try{p=cellMap.decode(cellId);}catch(_){invalid();}
  if(!Array.isArray(p)||!p.length)invalid();
  let d;
  switch(p[0]){
   case "inventory":
    if(p.length!==5||p[4]!=="counted_quantity")invalid();
    d={type:"inventory_count",table:"inventory_counts",column:"counted_quantity",branchId:p[1],filters:{session_id:p[2],item_id:p[3]},source:{sessionId:p[2],itemId:p[3]},writeScope:"inventory_open_session"};
    break;
   case "item":
    if(p.length!==3||p[2]!=="min_stock")invalid();
    d={type:"item_min_stock",table:"items",column:"min_stock",branchId:null,filters:{id:p[1]},source:{itemId:p[1]},writeScope:"item_branch_or_owner"};
    break;
   case "branch":
    if(p.length!==3||p[2]!=="required_headcount")invalid();
    d={type:"branch_required_headcount",table:"branches",column:"required_headcount",branchId:p[1],filters:{id:p[1]},source:{branchId:p[1]},writeScope:"owner_admin_only"};
    break;
   case "sales":
    if(p.length!==4||!MONTH.test(p[2])||!METRICS.includes(p[3]))invalid();
    d=p[3]==="sales_target"
     ?{type:"sales_metric",table:"sales_report_targets",column:"sales_target",branchId:p[1],filters:{branch_id:p[1],report_month:p[2]},source:{reportMonth:p[2]},writeScope:"sales_report_editor"}
     :{type:"sales_metric",table:"sales_report_months",column:p[3],branchId:p[1],filters:{branch_id:p[1],report_month:p[2]},source:{reportMonth:p[2]},writeScope:"sales_report_editor"};
    break;
   case "statistics":
    if((p.length!==6&&p.length!==5)||!MONTH.test(p[2]))invalid();
    if(p.length===5){
     if(p[4]!=="daily_target")invalid();
     d={type:"statistics_metric",table:"sales_report_statistics_entries",column:"daily_target",branchId:p[1],filters:{branch_id:p[1],report_month:p[2],report_day:Number(p[3])},source:{reportMonth:p[2],day:Number(p[3])},writeScope:"sales_report_editor"};
    }else{
     if(!GROUPS.includes(p[4])||!FIELDS.includes(p[5]))invalid();
     d={type:"statistics_metric",table:"sales_report_statistics_entries",column:p[4]+"_"+(p[5]==="tickets"?"tickets":"sales"),branchId:p[1],filters:{branch_id:p[1],report_month:p[2],report_day:Number(p[3])},source:{reportMonth:p[2],day:Number(p[3]),group:p[4],field:p[5]},writeScope:"sales_report_editor"};
    }
    if(!Number.isInteger(d.filters.report_day)||d.filters.report_day<1||d.filters.report_day>31)invalid();
    break;
   case "daily_tip":
    if(p.length!==7||!MONTH.test(p[2])||!/^\\d+$/.test(p[4])||!["tip_amount","dinein_sales"].includes(p[5])&&p.length===6)invalid();
    // The current stable map shape is: daily_tip|branch|month|sheet|day|field.
    if(p.length!==6||!/^\\d+$/.test(p[4])||!["tip_amount","dinein_sales"].includes(p[5]))invalid();
    d={type:"daily_tip",table:"sales_report_tip_sheets",column:"rows",branchId:p[1],filters:{id:p[3],branch_id:p[1],report_month:p[2]},source:{sheetId:p[3],reportMonth:p[2],day:Number(p[4]),field:p[5]},writeScope:"sales_report_editor"};
    if(d.source.day<1||d.source.day>31)invalid();
    break;
   case "headcount":
    if(p.length!==4||p[3]!=="required_count")invalid();
    d={type:"headcount_required",table:"branch_headcount_roles",column:"required_count",branchId:p[1],filters:{id:p[2],branch_id:p[1]},source:{roleId:p[2]},writeScope:"branch_headcount_editor"};
    break;
   default: invalid();
  }
  return Object.freeze({...d,cellId});
 }
 function extractValue(descriptor,row){
  if(!descriptor||typeof descriptor!=="object")throw new Error("وصف مصدر الخلية غير صالح");
  if(row==null)return null;
  let value;
  if(descriptor.type==="daily_tip"){
   if(!Array.isArray(row.rows))throw new Error("بيانات شيت الإكراميات غير صالحة");
   const dayRow=row.rows.find(x=>Number(x?.day)===descriptor.source.day);
   value=dayRow?.[descriptor.source.field];
  }else value=row[descriptor.column];
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  if(!Number.isFinite(n))throw new Error("القيمة المحفوظة في الخلية ليست رقمًا صالحًا");
  return n;
 }
 const api=Object.freeze({describeCell,extractValue});
 root.NOVAROFormulaSourceAdapter=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
