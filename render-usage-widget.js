// Shared HH Admin UI, intentionally manual because Render's public API does
// not expose the authoritative "Free instance hours" billing counter.
const copy={
  ru:{
    'Render Free hours':'Render — бесплатные часы',
    'Manual Billing snapshot':'Значение из Billing',
    'Used hours':'Использовано, ч',
    'Update':'Обновить',
    'Render Billing ↗':'Открыть Render Billing ↗',
    'Enter the used Free instance hours shown in Render Billing. This is shared by all services in your workspace.':'Укажи часы из Render → Billing. Лимит общий для всех Free web services этого пространства.',
    'Remaining':'Осталось',
    'Not recorded yet':'Расход пока не внесён',
    'Updated':'Обновлено',
    'Data unavailable':'Данные недоступны',
    'Save failed':'Ошибка сохранения',
    'Loading…':'Загрузка…'
  }
};
export function createRenderUsageWidget({isAdmin,language,request}){
 const $=s=>document.querySelector(s);
 const panel=$('#hhRenderUsagePanel');
 if(!panel)return {load:async()=>{},render:()=>{}};
 const input=$('#hhRenderUsageUsed'),summary=$('#hhRenderUsageSummary'),
  meta=$('#hhRenderUsageUpdated'),form=$('#hhRenderUsageForm'),
  button=$('#hhRenderUsageSave');
 let usage=null,loading=false,error='';
 const txt=k=>copy[language()]?.[k]||k;
 function render(){
  const show=Boolean(isAdmin());
  panel.classList.toggle('hidden',!show);
  if(!show){usage=null;input.value='';return;}
  panel.querySelectorAll('[data-render-text]').forEach(el=>{const key=el.dataset.renderText;el.textContent=txt(key);});
  const used=usage?.usedHours,remaining=usage?.remainingHours;
  if(typeof used==='number'&&typeof remaining==='number'){
   const format=n=>n.toLocaleString(language()==='ru'?'ru-RU':'en-GB',{maximumFractionDigits:2});
   summary.textContent=format(used)+' / 750 h  ·  '+txt('Remaining')+': '+format(remaining)+' h';
   input.value=String(used);
   meta.textContent=txt('Updated')+': '+new Date(usage.asOf).toLocaleString(language()==='ru'?'ru-RU':'en-GB');
  }else{
   summary.textContent='— / 750 h';
   meta.textContent=error||txt('Not recorded yet');
   input.value='';
  }
  if(error&&typeof used==='number')meta.textContent=error;
  button.disabled=loading;
 }
 async function load(){
  if(!isAdmin()||loading)return;
  loading=true;error='';render();meta.textContent=txt('Loading…');
  try{usage=await request('GET');}
  catch(e){error=txt('Data unavailable')+': '+e.message;}
  finally{loading=false;render();}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!isAdmin()||loading)return;
  const usedHours=Number(input.value);
  if(!input.value.trim()||!Number.isFinite(usedHours)||usedHours<0||usedHours>750)return;
  loading=true;error='';button.disabled=true;
  try{usage=await request('POST',{usedHours,month:usage?.month||new Date().toISOString().slice(0,7)});}
  catch(e){error=txt('Save failed')+': '+e.message;}
  finally{loading=false;render();}
 });
 return {load,render};
}
