import { firebaseConfig, USE_DEMO_MODE } from "./firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const $ = id => document.getElementById(id);
const today = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
let auth=null, db=null, currentUser=null, lessons=[], students=[], requests=[], activePage="overview";
let demo = USE_DEMO_MODE || firebaseConfig.apiKey.startsWith("PASTE_");
const demoKey="englishLessonsAdminDemoV1";
const ROOT="englishLessons"; // Isolate CRM records from other apps in the shared Firebase project.
const seed = () => {
  try { const x=JSON.parse(localStorage.getItem(demoKey)); if(x) return x; } catch {}
  const d=iso(today);
  return {students:[{id:"s1",name:"Александр",email:"alex@example.com",note:""},{id:"s2",name:"Мария",email:"maria@example.com",note:""}],
    lessons:[{id:"l1",studentId:"s1",date:d,time:"16:00",duration:60,status:"planned",note:"Speaking practice"},{id:"l2",studentId:"s2",date:d,time:"18:00",duration:60,status:"completed",note:"Unit 3"}],requests:[]};
};
let demoData=seed();
function persistDemo(){localStorage.setItem(demoKey,JSON.stringify(demoData));}
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2600);}
function studentName(id){return students.find(s=>s.id===id)?.name||"Ученик удалён";}
function dateLabel(s){return new Date(s+"T12:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"long",weekday:"long"});}
function setData(data){students=data.students||[];lessons=data.lessons||[];requests=data.requests||[];renderAll();}
async function loadData(){
 if(demo){setData(demoData);return;}
 const [s,l,r]=await Promise.all([get(ref(db,`${ROOT}/students`)),get(ref(db,`${ROOT}/lessons`)),get(ref(db,`${ROOT}/transferRequests`))]);
 setData({students:Object.entries(s.val()||{}).map(([id,v])=>({id,...v})),lessons:Object.entries(l.val()||{}).map(([id,v])=>({id,...v})),requests:Object.entries(r.val()||{}).map(([id,v])=>({id,...v}))});
}
async function saveRecord(path,id,obj){
 if(demo){const key=path==="students"?"students":"lessons";const arr=demoData[key];const i=arr.findIndex(x=>x.id===id);if(i>=0)arr[i]={...obj,id};else arr.push({...obj,id});persistDemo();setData(demoData);return;}
 if(id) await update(ref(db,`${ROOT}/${path}/${id}`),obj); else await set(push(ref(db,`${ROOT}/${path}`)),obj); await loadData();
}
async function deleteRecord(path,id){
 if(demo){const key=path==="students"?"students":"lessons";demoData[key]=demoData[key].filter(x=>x.id!==id);persistDemo();setData(demoData);return;}
 await remove(ref(db,`${ROOT}/${path}/${id}`));await loadData();
}
function showPage(page){activePage=page;document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));$("page-"+page).classList.remove("hidden");document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.page===page));$("pageCrumb").textContent=({overview:"Обзор",schedule:"Расписание",students:"Ученики",history:"История занятий",requests:"Запросы на перенос",reports:"Статистика"})[page];renderAll();}
function renderAll(){renderOverview();renderCalendar();renderStudents();renderHistory();renderRequests();renderReport();$("studentCount").textContent=students.length;$("completedCount").textContent=lessons.filter(x=>x.status==="completed").length;$("pendingCount").textContent=requests.filter(x=>x.status==="pending").length;$("requestBadge").textContent=requests.filter(x=>x.status==="pending").length;$("requestBadge").classList.toggle("hidden",!requests.some(x=>x.status==="pending"));}
function renderOverview(){const d=iso(today);const day=lessons.filter(x=>x.date===d).sort((a,b)=>a.time.localeCompare(b.time));$("todayCount").textContent=day.length;$("upcomingList").classList.toggle("empty-state",!day.length);$("upcomingList").innerHTML=day.length?day.map(x=>`<div class="upcoming-item"><div class="up-time">${esc(x.time)}</div><div><div class="up-name">${esc(studentName(x.studentId))}</div><div class="up-note">${esc(x.note||"Английский язык")} · ${x.duration} мин.</div></div><span class="status ${x.status}">${statusText(x.status)}</span></div>`).join(""):"Пока нет занятий на сегодня. Добавьте первое занятие.";}
function renderCalendar(){const d=$("scheduleDate").value||iso(today);$("calendarDayTitle").textContent=dateLabel(d);const rows=[];for(let h=8;h<=21;h++){const time=String(h).padStart(2,"0")+":00";const slot=lessons.filter(x=>x.date===d&&x.time.slice(0,2)===String(h).padStart(2,"0"));rows.push(`<div class="time-row"><div class="time-label">${time}</div><div class="time-slot">${slot.length?slot.map(x=>`<button class="lesson-chip ${x.status}" data-lesson="${x.id}"><b>${esc(studentName(x.studentId))} · ${esc(x.time)}</b><small>${x.duration} минут · ${statusText(x.status)}${x.note?" · "+esc(x.note):""}</small></button>`).join(""):`<button class="slot-add" data-time="${time}">＋ Добавить занятие</button>`}</div></div>`);} $("dayGrid").innerHTML=rows.join("");}
function renderStudents(){const q=$("studentSearch").value.toLowerCase();const arr=students.filter(s=>(s.name+" "+(s.email||"")).toLowerCase().includes(q));$("studentTotal").textContent=`${students.length} учен.`;$("studentsEmpty").classList.toggle("hidden",arr.length>0);$("studentsTable").innerHTML=arr.map(s=>`<tr><td><b>${esc(s.name)}</b><span class="sub">${esc(s.note||"")}</span></td><td>${esc(s.email||"—")}</td><td>${lessons.filter(l=>l.studentId===s.id&&l.status==="completed").length}</td><td><button class="table-action" data-student="${s.id}">Изменить</button></td></tr>`).join("");}
function renderHistory(){const from=$("historyFrom").value,to=$("historyTo").value;const arr=lessons.filter(x=>(!from||x.date>=from)&&(!to||x.date<=to)).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));$("historyTable").innerHTML=arr.map(x=>`<tr><td>${dateLabel(x.date)}<span class="sub">${esc(x.time)}</span></td><td>${esc(studentName(x.studentId))}</td><td><span class="status ${x.status}">${statusText(x.status)}</span></td><td>${esc(x.note||"—")}</td></tr>`).join("")||`<tr><td colspan="4" class="empty-state">Записей за этот период нет.</td></tr>`;}
function renderRequests(){const arr=requests.filter(x=>x.status==="pending");$("requestsList").classList.toggle("empty-state",!arr.length);$("requestsList").innerHTML=arr.length?arr.map(x=>`<div class="request-card"><div><b>${esc(studentName(x.studentId))}</b><p>Запрос: ${esc(x.oldDate||"—")} ${esc(x.oldTime||"")} → ${esc(x.newDate||"")} ${esc(x.newTime||"")}</p><p>${esc(x.message||"Без комментария")}</p></div><div class="request-actions"><button class="table-action" data-request="${x.id}" data-decision="approved">Принять</button><button class="table-action" data-request="${x.id}" data-decision="rejected">Отклонить</button></div></div>`).join(""):"Новых запросов пока нет.";}
function renderReport(){const from=$("reportFrom").value,to=$("reportTo").value;const arr=lessons.filter(x=>(!from||x.date>=from)&&(!to||x.date<=to));const done=arr.filter(x=>x.status==="completed");const planned=arr.filter(x=>x.status==="planned");$("reportCompleted").textContent=done.length;$("reportPlanned").textContent=planned.length;$("reportStudents").textContent=new Set(done.map(x=>x.studentId)).size;const counts=students.map(s=>({s,done:done.filter(x=>x.studentId===s.id).length,planned:planned.filter(x=>x.studentId===s.id).length})).filter(x=>x.done||x.planned);$("reportTable").innerHTML=counts.map(x=>`<tr><td>${esc(x.s.name)}</td><td>${x.done}</td><td>${x.planned}</td></tr>`).join("")||`<tr><td colspan="3" class="empty-state">Нет занятий за выбранный период.</td></tr>`;}
function statusText(s){return({planned:"Запланировано",completed:"Проведено",cancelled:"Отменено",missed:"Пропуск"})[s]||s;}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function openLesson(id="",date=$("scheduleDate").value||iso(today),time="16:00"){const x=lessons.find(l=>l.id===id);$("lessonForm").reset();$("lessonId").value=x?.id||"";$("modalTitle").textContent=x?"Изменить занятие":"Новое занятие";$("modalEyebrow").textContent=x?"УПРАВЛЕНИЕ ЗАПИСЬЮ":"НОВАЯ ЗАПИСЬ";$("lessonStudent").innerHTML='<option value="">Выберите ученика</option>'+students.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");$("lessonDate").value=x?.date||date;$("lessonTime").value=x?.time||time;$("lessonDuration").value=String(x?.duration||60);$("lessonStatus").value=x?.status||"planned";$("lessonNote").value=x?.note||"";$("lessonStudent").value=x?.studentId||"";$("deleteLesson").classList.toggle("hidden",!x);$("modalError").textContent="";$("modalBackdrop").classList.remove("hidden");}
function closeLesson(){$("modalBackdrop").classList.add("hidden");}
function openStudent(id=""){const s=students.find(x=>x.id===id);$("studentForm").reset();$("studentId").value=s?.id||"";$("studentModalTitle").textContent=s?"Изменить ученика":"Новый ученик";$("studentName").value=s?.name||"";$("studentEmail").value=s?.email||"";$("studentNote").value=s?.note||"";$("studentBackdrop").classList.remove("hidden");}
function closeStudent(){$("studentBackdrop").classList.add("hidden");}
function showApp(){ $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");$("todayLabel").textContent=today.toLocaleDateString("ru-RU",{day:"numeric",month:"long",weekday:"short"});$("scheduleDate").value=iso(today);$("reportFrom").value=iso(new Date(today.getFullYear(),today.getMonth(),1));$("reportTo").value=iso(today);loadData().catch(e=>toast("Не удалось загрузить данные: "+e.message));}
function showLogin(){ $("appView").classList.add("hidden");$("loginView").classList.remove("hidden");}
async function init(){
 if(!demo){try{const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getDatabase(app);onAuthStateChanged(auth,async user=>{if(!user){currentUser=null;showLogin();return;}try{const token=await user.getIdTokenResult(true);if(token.claims.role!=="admin"){await signOut(auth);$("loginError").textContent="У аккаунта нет прав администратора.";return;}currentUser=user;showApp();}catch(e){$("loginError").textContent="Ошибка проверки доступа.";}});}catch(e){demo=true;showLogin();}}
 else showApp();
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";if(demo){toast("Демо-режим: подключите Firebase для настоящего входа.");return;}try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}catch(e){$("loginError").textContent="Не удалось войти. Проверьте email и пароль."; }});
$("logoutBtn").onclick=async()=>{if(auth&&!demo)await signOut(auth);showLogin();};
$("nav").onclick=e=>{const b=e.target.closest("[data-page]");if(b)showPage(b.dataset.page);};
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.goto)));
$("quickAdd").onclick=$("addLesson").onclick=()=>{if(!students.length){toast("Сначала добавьте ученика.");showPage("students");return;}openLesson();};
$("quickStudent").onclick=$("addStudent").onclick=()=>openStudent();
$("closeModal").onclick=$("cancelModal").onclick=closeLesson;$("closeStudentModal").onclick=$("cancelStudent").onclick=closeStudent;
$("modalBackdrop").onclick=e=>{if(e.target===$("modalBackdrop"))closeLesson();};$("studentBackdrop").onclick=e=>{if(e.target===$("studentBackdrop"))closeStudent();};
$("lessonForm").onsubmit=async e=>{e.preventDefault();const id=$("lessonId").value;const obj={studentId:$("lessonStudent").value,date:$("lessonDate").value,time:$("lessonTime").value,duration:Number($("lessonDuration").value),status:$("lessonStatus").value,note:$("lessonNote").value.trim(),updatedAt:Date.now()};if(!obj.studentId){$("modalError").textContent="Выберите ученика.";return;}const conflict=lessons.find(l=>l.id!==id&&l.date===obj.date&&l.time===obj.time&&l.status!=="cancelled");if(conflict){$("modalError").textContent="На это время уже есть занятие. Выберите другое время.";return;}try{await saveRecord("lessons",id,obj);closeLesson();toast(id?"Занятие обновлено":"Занятие добавлено");}catch(e){$("modalError").textContent="Ошибка сохранения.";}}
$("deleteLesson").onclick=async()=>{const id=$("lessonId").value;if(id&&confirm("Удалить это занятие?")){await deleteRecord("lessons",id);closeLesson();toast("Занятие удалено");}};
$("studentForm").onsubmit=async e=>{e.preventDefault();const id=$("studentId").value;const obj={name:$("studentName").value.trim(),email:$("studentEmail").value.trim(),note:$("studentNote").value.trim(),updatedAt:Date.now()};if(!obj.name){$("studentError").textContent="Введите имя.";return;}await saveRecord("students",id,obj);closeStudent();toast(id?"Карточка обновлена":"Ученик добавлен");};
$("studentsTable").onclick=e=>{const b=e.target.closest("[data-student]");if(b)openStudent(b.dataset.student);};
$("studentSearch").oninput=renderStudents;
$("dayGrid").onclick=e=>{const lesson=e.target.closest("[data-lesson]");const slot=e.target.closest("[data-time]");if(lesson)openLesson(lesson.dataset.lesson);else if(slot){if(!students.length){toast("Сначала добавьте ученика.");showPage("students");}else openLesson("",$("scheduleDate").value,slot.dataset.time);}};
$("scheduleDate").onchange=renderCalendar;$("prevDay").onclick=()=>shiftDay(-1);$("nextDay").onclick=()=>shiftDay(1);$("todayBtn").onclick=()=>{$("scheduleDate").value=iso(today);renderCalendar();};
function shiftDay(n){const d=new Date($("scheduleDate").value+"T12:00:00");d.setDate(d.getDate()+n);$("scheduleDate").value=iso(d);renderCalendar();}
$("filterHistory").onclick=renderHistory;$("runReport").onclick=renderReport;
$("requestsList").onclick=async e=>{const b=e.target.closest("[data-request]");if(!b)return;const id=b.dataset.request,decision=b.dataset.decision;if(demo){const x=demoData.requests.find(r=>r.id===id);if(x)x.status=decision;persistDemo();setData(demoData);}else await update(ref(db,`${ROOT}/transferRequests/${id}`),{status:decision,reviewedAt:Date.now()});toast(decision==="approved"?"Запрос принят":"Запрос отклонён");};
$("historyFrom").value="";$("historyTo").value=iso(today);
init();
