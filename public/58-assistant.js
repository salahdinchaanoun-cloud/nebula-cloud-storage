(()=>{
const $=s=>document.querySelector(s);
const status=$('#ai-provider-status'),form=$('#chat-form'),input=$('#chat-input'),log=$('#chat-log'),btn=$('#send-btn'),quick=$('#quick-prompts');
const picker=$('#agent-picker'),trigger=$('#agent-trigger'),menu=$('#agent-menu'),curName=$('#agent-current-name');
const STORE='nebula.agent';
let busy=false,agents=[],current='',history=[];

const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatReply=s=>escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/^#{1,3}\s+(.+)$/gm,'<strong class="reply-heading">$1</strong>').replace(/^\s*[-*]\s+(.+)$/gm,'<span class="reply-bullet">•</span> $1').replace(/\n/g,'<br>');
const routeFor=q=>{q=q.toLowerCase();
 if(/رفع|ارفع|تحميل ملف|ملف جديد|upload/.test(q))return {url:'/dashboard',title:'لوحة مساحتي',desc:'من هنا يمكنك اختيار ملف ورفعه إلى مساحتك.',cta:'فتح لوحة المساحة'};
 if(/مشاركة|رابط|شارك/.test(q))return {url:'/dashboard',title:'مشاركة ملف',desc:'اضغط «مشاركة الرابط» تحت أي ملف لنسخ رابط صفحة التنزيل.',cta:'فتح ملفاتي'};
 if(/ملفات|ملفاتي|تنزيل|حذف ملف/.test(q))return {url:'/dashboard',title:'ملفاتي',desc:'اعرض ملفاتك وأدرها من لوحة مساحتي.',cta:'عرض ملفاتي'};
 if(/مساحة|الحصّة|زيادة|الحد/.test(q))return {url:'/dashboard',title:'المساحة والتخزين',desc:'تحقق من استخدام مساحتك، ولطلب زيادة تواصل مع المدير.',cta:'فتح لوحة المساحة'};
 if(/لوحة التحكم|حسابي|مساحتي|dashboard/.test(q))return {url:'/dashboard',title:'لوحة مساحتي',desc:'الوصول إلى ملفاتك وإحصاءات التخزين.',cta:'فتح اللوحة'};
 if(/مدير|إدارة|المستخدمين|admin/.test(q))return {url:'/admin',title:'لوحة الإدارة',desc:'صفحة الإدارة متاحة لحسابات المدير فقط.',cta:'فتح لوحة الإدارة'};
 if(/تسجيل|دخول|كلمة المرور|حساب جديد|إنشاء حساب/.test(q))return {url:'/login',title:'تسجيل الدخول',desc:'انتقل لتسجيل الدخول أو إنشاء حساب جديد.',cta:'فتح صفحة الدخول'};
 if(/مساعد|ai|ذكاء اصطناعي/.test(q))return {url:'/assistant',title:'مساعد Silver AI',desc:'أنت هنا بالفعل في صفحة المساعد.',cta:'العودة للمساعد'};
 return null};

function routeCard(route){const a=document.createElement('a');a.className='route-card';a.href=route.url;const copy=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small'),em=document.createElement('em');strong.textContent=route.title;small.textContent=route.desc;em.textContent=route.cta+' ↗';copy.append(strong,small);a.append(copy,em);return a}
function add(role,text,opts={}){
  const el=document.createElement('div');el.className='chat-message '+role;
  const av=document.createElement('div');av.className='message-avatar';av.textContent=role==='me'?'أنت':'S';
  const body=document.createElement('div');body.className='message-body';
  const head=document.createElement('b');head.textContent=role==='me'?'أنت':'Silver AI';
  if(role==='bot'&&opts.agent){const tag=document.createElement('span');tag.className='agent-tag';tag.textContent=opts.agent;head.append(tag)}
  const time=document.createElement('small');time.textContent='الآن';head.append(time);body.append(head);
  const p=document.createElement('p');p.textContent=text;body.append(p);
  if(opts.typing){p.innerHTML='<span class="typing-dots"><i></i><i></i><i></i></span>';p.setAttribute('aria-label','يفكر المساعد')}
  el.append(av,body);log.append(el);log.scrollTop=log.scrollHeight;return {p,body};
}

/* ===== الملفات وروابط النسخ ===== */
async function copyText(v){try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(v);return true}}catch(_){}
  try{const el=document.createElement('textarea');el.value=v;el.setAttribute('readonly','');el.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(el);el.select();const ok=document.execCommand('copy');el.remove();return ok}catch(_){return false}}
function renderFiles(files,container){
  const box=document.createElement('div');box.style.cssText='display:grid;gap:8px;margin-top:12px';
  if(!files.length){const p=document.createElement('small');p.textContent='لا توجد ملفات في حسابك بعد.';box.append(p);container.append(box);return}
  files.forEach(f=>{
    const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid #ffffff1a;border-radius:10px;cursor:pointer';
    const cb=document.createElement('input');cb.type='checkbox';cb.dataset.fileId=String(f.id);
    const name=document.createElement('span');name.style.cssText='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';name.textContent=f.name;
    const meta=document.createElement('small');meta.textContent=f.size+' · '+f.date;
    row.append(cb,name,meta);box.append(row);
  });
  container.append(box);
}
function renderLinks(links,container){
  const box=document.createElement('div');box.style.cssText='display:grid;gap:8px;margin-top:12px';
  links.forEach(l=>{
    const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    const n=document.createElement('strong');n.textContent=l.name;
    const u=document.createElement('code');u.textContent=l.url;u.style.cssText='direction:ltr;font-size:12px;word-break:break-all;flex:1;min-width:0';
    const b=document.createElement('button');b.type='button';b.textContent='نسخ الرابط';b.style.cssText='padding:6px 10px;border-radius:8px;cursor:pointer';
    b.addEventListener('click',async()=>{const ok=await copyText(l.url);b.textContent=ok?'تم النسخ ✓':'تعذر النسخ';setTimeout(()=>{b.textContent='نسخ الرابط'},1500)});
    row.append(n,u,b);box.append(row);
  });
  container.append(box);
}

function renderPending(p,container){
  const box=document.createElement('div');box.style.cssText='margin-top:12px;padding:12px;border:1px solid #ffb86c55;border-radius:12px;display:grid;gap:10px';
  const t=document.createElement('div');t.textContent='يحتاج تأكيدك: '+p.description;
  const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
  const ok=document.createElement('button');ok.type='button';ok.textContent='تأكيد التنفيذ';ok.style.cssText='padding:7px 12px;border-radius:8px;cursor:pointer';
  const no=document.createElement('button');no.type='button';no.textContent='إلغاء';no.style.cssText='padding:7px 12px;border-radius:8px;cursor:pointer';
  const lock=()=>{ok.disabled=true;no.disabled=true};
  const post=(url,body)=>fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  ok.addEventListener('click',async()=>{lock();try{const r=await post('/api/assistant/confirm',{id:p.id});const d=await r.json().catch(()=>({}));add('bot',r.ok?(d.message||'تم التنفيذ.'):(d.error||'تعذر التنفيذ.'))}catch{add('bot','تعذر الاتصال بالخادم.')}});
  no.addEventListener('click',async()=>{lock();try{await post('/api/assistant/cancel',{id:p.id})}catch(_){}add('bot','تم إلغاء الطلب.')});
  row.append(ok,no);box.append(t,row);container.append(box);
}

/* ===== قائمة الوكلاء ===== */
const agentById=id=>agents.find(a=>a.id===id);
function setStatus(){
  if(!status)return;const a=agentById(current);
  if(!agents.some(x=>x.configured)){status.innerHTML='<i></i> لا يوجد وكيل مفعّل — يحتاج المدير إلى إضافة مفتاح';status.classList.add('provider-error');return}
  status.classList.toggle('provider-error',!(a&&a.configured));
  status.innerHTML='<i></i> '+(a&&a.configured?'الوكيل المتصل: '+escapeHtml(a.label)+' · '+escapeHtml(a.model):'هذا الوكيل غير مفعّل — اختر وكيلاً آخر');
}
function renderMenu(){
  menu.innerHTML='';
  agents.forEach(a=>{
    const li=document.createElement('li');li.setAttribute('role','option');li.dataset.id=a.id;li.tabIndex=-1;
    li.className='agent-item'+(a.id===current?' active':'')+(a.configured?'':' off');
    li.setAttribute('aria-selected',a.id===current?'true':'false');
    if(!a.configured)li.setAttribute('aria-disabled','true');
    const dot=document.createElement('i');dot.className='agent-dot'+(a.configured?'':' off');
    const txt=document.createElement('span');txt.className='agent-txt';
    const b=document.createElement('b');b.textContent=a.label;const s=document.createElement('small');s.textContent=a.configured?a.vendor+' · '+a.model:a.vendor+' · غير مفعّل';
    txt.append(b,s);li.append(dot,txt);
    if(a.id===current){const ck=document.createElement('em');ck.textContent='✓';li.append(ck)}
    menu.append(li);
  });
  const a=agentById(current);curName.textContent=a?a.label:'اختر وكيلاً';
}
function openMenu(open){menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));picker.classList.toggle('open',open);if(open){const act=menu.querySelector('.active')||menu.querySelector('.agent-item:not(.off)');act&&act.focus()}}
function choose(id){
  const a=agentById(id);if(!a||!a.configured)return;
  const changed=id!==current;current=id;try{localStorage.setItem(STORE,id)}catch{}
  renderMenu();setStatus();openMenu(false);trigger.focus();
  if(changed&&history.length)add('bot','تم التبديل إلى وكيل '+a.label+'. سأكمل المحادثة من حيث توقفنا.',{agent:a.label});
}
trigger.addEventListener('click',()=>openMenu(menu.hidden));
menu.addEventListener('click',e=>{const li=e.target.closest('.agent-item');if(li)choose(li.dataset.id)});
menu.addEventListener('keydown',e=>{
  const items=[...menu.querySelectorAll('.agent-item:not(.off)')],i=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();(items[i+1]||items[0])?.focus()}
  else if(e.key==='ArrowUp'){e.preventDefault();(items[i-1]||items[items.length-1])?.focus()}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();document.activeElement.classList?.contains('agent-item')&&choose(document.activeElement.dataset.id)}
  else if(e.key==='Escape'||e.key==='Tab'){openMenu(false);trigger.focus()}
});
document.addEventListener('click',e=>{if(!menu.hidden&&!picker.contains(e.target))openMenu(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){openMenu(false);trigger.focus()}});

fetch('/api/assistant/providers',{credentials:'same-origin'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||('HTTP '+r.status)),{http:r.status});return d}).then(d=>{
  agents=d.agents||[];if(d.problem)add('bot','⚠ '+d.problem);let saved='';try{saved=localStorage.getItem(STORE)||''}catch{}
  current=(agentById(saved)&&agentById(saved).configured)?saved:(d.default||(agents.find(a=>a.configured)||{}).id||'');
  renderMenu();setStatus();
}).catch(e=>{curName.textContent='تعذر التحميل';if(status){status.classList.add('provider-error');status.textContent=e.http===401?'انتهت الجلسة — سجّل الدخول من جديد':'تعذر تحميل الوكلاء ('+(e.message||'خطأ')+')'}});

/* ===== الإرسال ===== */
async function send(value){
  if(busy)return;const message=(value??input.value).trim();if(!message)return;
  const a=agentById(current);
  if(!a||!a.configured){add('bot','لا يوجد وكيل مفعّل حالياً. اختر وكيلاً من القائمة أعلاه.');return}
  busy=true;add('me',message);input.value='';input.style.height='auto';btn.disabled=true;btn.querySelector('span').textContent='جارٍ';
  const t=add('bot','',{typing:true,agent:a.label});
  try{
    const r=await fetch('/api/assistant/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,provider:current,history:history.slice(-10),selectedFileIds:[...log.querySelectorAll('input[data-file-id]:checked')].map(i=>Number(i.dataset.fileId))})});
    if(r.status===401){t.p.textContent='انتهت جلستك. أعد تسجيل الدخول ثم حاول مجدداً.';return}
    const d=await r.json().catch(()=>({}));
    t.p.innerHTML=formatReply(d.reply||d.error||'حدث خطأ غير معروف.');
    if(d.files)renderFiles(d.files,t.body);
    if(d.links)renderLinks(d.links,t.body);
    if(d.pending)renderPending(d.pending,t.body);
    if(d.reply){history.push({role:'user',content:message},{role:'assistant',content:d.reply});if(history.length>20)history=history.slice(-20)}
    const route=routeFor(message);if(route)t.body.append(routeCard(route));
  }catch{t.p.textContent='تعذر الاتصال بالخادم. تحقق من الاتصال ثم حاول مجدداً.'}
  finally{busy=false;btn.disabled=false;btn.querySelector('span').textContent='إرسال';input.focus();log.scrollTop=log.scrollHeight}
}
form.addEventListener('submit',e=>{e.preventDefault();send()});
input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,150)+'px'});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
quick?.addEventListener('click',e=>{const b=e.target.closest('button');if(b)send(b.textContent)});
$('#clear-chat')?.addEventListener('click',()=>{history=[];log.innerHTML='';add('bot','مرحباً من جديد! كيف يمكنني مساعدتك في استخدام Nebula؟');input.focus()});
})();
