// Shared admin-only meter. Both registries read the same backend snapshot.
const copy={
 ru:{
  'Render Free hours':'Render — бесплатные часы',
  'Estimate':'Оценка',
  'Billing baseline':'Последняя сверка Billing',
  'Render Billing ↗':'Открыть Render Billing ↗',
  'Remaining':'Осталось',
  'Updated':'Обновлено',
  'Loading…':'Загрузка…',
  'Data unavailable':'Данные недоступны',
  'Automatic updates are not configured':'Автоматическое обновление не настроено',
  'Waiting for the next telemetry update':'Ожидается следующее обновление метрик',
  'Refresh failed; showing the last saved value':'Не удалось обновить; показано последнее сохранённое значение',
  'All free web services in this workspace. Estimated from runtime metrics; may differ from Billing. Updates automatically while this page is open.':'Все бесплатные веб-сервисы workspace. Оценка по метрикам работы; возможны отличия от Billing. Обновляется автоматически, пока страница открыта.',
  'Services':'Сервисов'
 }
};
export function createRenderUsageWidget({isAdmin,language,request}){
 const $=s=>document.querySelector(s),panel=$('#hhRenderUsagePanel');
 if(!panel)return {load:async()=>{},render:()=>{}};
 const summary=$('#hhRenderUsageSummary'),meta=$('#hhRenderUsageUpdated');
 let usage=null,loading=false,error='',lastAttempt=0;
 const txt=k=>copy[language()]?.[k]||k;
 function render(){
  const show=Boolean(isAdmin());
  panel.classList.toggle('hidden',!show);
  if(!show){usage=null;return;}
  panel.querySelectorAll('[data-render-text]').forEach(el=>{el.textContent=txt(el.dataset.renderText);});
  const badge=panel.querySelector('.hh-render-usage-manual');
  badge.textContent=txt(usage?.source==='estimated-render-metrics'?'Estimate':'Billing baseline');
  const used=usage?.usedHours,remaining=usage?.remainingHours;
  if(typeof used==='number'&&typeof remaining==='number'){
   const format=n=>n.toLocaleString(language()==='ru'?'ru-RU':'en-GB',{maximumFractionDigits:2});
   const unit=language()==='ru'?'ч':'h';
   summary.textContent=format(used)+' / 750 '+unit+' · '+txt('Remaining')+': '+format(remaining)+' '+unit;
   meta.textContent=txt('Updated')+': '+new Date(usage.asOf).toLocaleString(language()==='ru'?'ru-RU':'en-GB');
   if(usage.serviceCount!=null)meta.textContent+=' · '+txt('Services')+': '+usage.serviceCount;
  }else{
   summary.textContent='— / 750 h';meta.textContent=loading?txt('Loading…'):txt('Data unavailable');
  }
  let status=error||(usage?.warning?txt('Refresh failed; showing the last saved value'):'');
  if(!status&&usage&&!usage.automaticConfigured)status=txt('Automatic updates are not configured');
  if(!status&&usage?.automaticConfigured&&usage.source!=='estimated-render-metrics')status=txt('Waiting for the next telemetry update');
  if(status)meta.textContent+=' · '+status;
 }
 async function load(){
  if(!isAdmin()||loading)return;
  loading=true;lastAttempt=Date.now();error='';render();
  try{const next=await request('GET');if(isAdmin())usage=next;}
  catch{error=txt('Data unavailable');}
  finally{loading=false;render();}
 }
 // Never ping monitored apps, or poll while the page is in the background.
 function tick(){
  if(!document.hidden&&isAdmin()&&Date.now()-lastAttempt>=15*60000)void load();
 }
 setInterval(tick,60000);
 document.addEventListener('visibilitychange',tick);
 return {load,render};
}

