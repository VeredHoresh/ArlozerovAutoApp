const $ = selector => document.querySelector(selector);
const ZONE = 'Asia/Jerusalem';
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmt = (ms, options = {}) => new Intl.DateTimeFormat('he-IL', { timeZone: ZONE, ...options }).format(new Date(ms));
const minutesText = n => n === 1 ? 'דקה אחת' : n === 2 ? 'שתי דקות' : `${n} דקות`;
const daysText = n => n === 1 ? 'יום אחד' : n === 2 ? 'יומיים' : `${n} ימים`;
const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const today = dateFormat.format(new Date());
function shift(date, n) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
let week = shift(today, -new Date(today + 'T12:00:00Z').getUTCDay());
let selectedDate = today, classes = [], state = { rules: [], jobs: [] }, selectedClass, view = 'schedule', calendarRequest = 0;
let upcoming = [], cancellingClass;
let calendarLoading = false, calendarError = '', loadedWeek = null;
const loadedDays = new Map();
let accountGeneration = 0;
function clearAccountData() {
  accountGeneration++; calendarRequest++; classes = []; upcoming = []; loadedDays.clear();
  state = { rules: [], jobs: [], connected: false }; calendarLoading = false; calendarError = ''; loadedWeek = null;
  $('#classes').replaceChildren(el('div', 'empty', 'יש להיכנס לחשבון כדי לצפות בחוגים שלך.'));
  $('#bookings-list').replaceChildren(); $('#rules-list').replaceChildren(); $('#jobs-list').replaceChildren();
  $('#class-count').textContent = '—'; $('#active-count').textContent = '0'; $('#rule-count').textContent = '0';
  $('#member-label').textContent = 'כניסה עם חשבון פיזיקל'; $('#account-label').textContent = 'החשבון האישי שלך';
  $('#mode-banner').textContent = 'יש להיכנס עם חשבון הפיזיקל האישי כדי לנהל את החוגים שלך.';
  $('#error').hidden = true;
  for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'auth-dialog') d.close();
}
function el(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; setTimeout(() => { $('#toast').hidden = true; }, 10000); }
function error(message) { $('#error').textContent = message || ''; $('#error').hidden = !message; }
async function api(path, options = {}) {
  const generation = accountGeneration;
  const res = await fetch('/api/' + path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.accountId ? { 'X-Arlo-Account': state.accountId } : {}), ...options.headers } });
  const data = await res.json();
  if (generation !== accountGeneration) throw new Error('החשבון השתנה. יש לנסות שוב.');
  if (!res.ok) {
    if ((res.status === 401 && path !== 'auth') || data.code === 'ACCOUNT_CHANGED') { clearAccountData(); if (!$('#auth-dialog').open) $('#auth-dialog').showModal(); }
    throw new Error(heText(data.error) || 'הפעולה לא הושלמה. יש לנסות שוב.');
  }
  return data;
}
async function refreshState() {
  const next = await api('state');
  const changed = JSON.stringify(next) !== JSON.stringify(state);
  state = next;
  if (changed) renderState();
}
function renderState() {
  $('#rule-count').textContent = state.rules.length;
  $('#active-count').textContent = state.rules.filter(r => r.enabled).length;
  $('#member-label').textContent = state.connected ? (state.member && state.member !== 'Member' ? state.member : 'החשבון מחובר לקאנטרי') : 'כניסה לחשבון';
  $('#account-label').textContent = state.connected ? 'ניהול החשבון' : 'חשבון פיזיקל';
  $('#disconnect').hidden = !state.connected;
  $('#mode-banner').classList.toggle('live', state.live && state.connected);
  $('#mode-banner').textContent = !state.live ? (state.connected ? 'הרשמה שבועית מושהית' : 'להרשמה לחוגים יש להתחבר לפיזיקל') : state.connected ? 'הרשמה שבועית פעילה' : 'כדי לאפשר הרשמה יש להתחבר לחשבון פיזיקל.';
  if (state.syncError) $('#mode-banner').textContent += ' לא ניתן לעדכן את לוח החוגים: ' + heText(state.syncError);
  renderRules(); renderJobs(); renderClasses();
  if (view === 'upcoming') {
    renderBookings();
    if (state.jobs.some(j => j.ruleId === 'one-time' && ['registered', 'waitlisted'].includes(j.status) && j.startsAt > Date.now() && !upcoming.some(a => a.key === j.key))) loadBookings();
  }
}
async function loadCalendar(force = false) {
  const request = ++calendarRequest, start = selectedDate;
  const savedDay = loadedDays.get(start);
  if (!force && savedDay && Date.now() - savedDay.fetchedAt < 30000) {
    calendarLoading = false; calendarError = ''; renderDays(); renderClasses(); return;
  }
  calendarLoading = true; calendarError = '';
  $('#refresh').disabled = true;
  renderClasses();
  renderDays(); error('');
  try {
    const data = await api('calendar?start=' + start + '&days=1' + (force ? '&refresh=1' : ''));
    if (request !== calendarRequest) return;
    loadedDays.set(start, data);
    classes = [...classes.filter(a => a.date !== start), ...data.classes];
    loadedWeek = start; calendarLoading = false;
    $('#class-count').textContent = classes.filter(a => a.date >= week && a.date <= shift(week, 6)).length;
    $('#sync-label').textContent = (data.stale ? 'לוח חוגים שמור · עודכן בשעה ' : 'לוח חוגים מעודכן · עודכן בשעה ') + fmt(data.fetchedAt, { hour: '2-digit', minute: '2-digit' });
    if (data.stale) error('פיזיקל מגיבה לאט. מוצג לוח החוגים האחרון שנשמר; זמינות המקום תיבדק בעת ההרשמה.');
    const value = $('#type-filter').value;
    $('#type-filter').replaceChildren(new Option('כל החוגים', ''));
    [...new Set(classes.map(a => a.name))].sort((a, b) => a.localeCompare(b, 'he')).forEach(name => $('#type-filter').add(new Option(name, name)));
    $('#type-filter').value = value;
    renderClasses();
  } catch (e) { if (request === calendarRequest) { calendarError = 'לא ניתן לטעון את לוח החוגים מפיזיקל. לניסיון נוסף יש ללחוץ על ״עדכון לוח החוגים״.'; error(heText(e.message)); } }
  finally { if (request === calendarRequest) { calendarLoading = false; $('#refresh').disabled = false; renderClasses(); } }
}
function renderDays() {
  const start = new Date(week + 'T12:00:00Z'), end = new Date(shift(week, 6) + 'T12:00:00Z');
  $('#week-label').textContent = `${fmt(start, { day: 'numeric', month: 'long' })} – ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  $('#days').replaceChildren();
  days.forEach((day, i) => {
    const date = shift(week, i), button = el('button', 'day' + (date === selectedDate ? ' selected' : '') + (date === today ? ' is-today' : ''));
    button.setAttribute('aria-label', fmt(new Date(date + 'T12:00:00Z'), { weekday: 'long', day: 'numeric', month: 'long' })); button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', date === selectedDate ? 'true' : 'false');
    button.append(el('small', '', day), el('strong', '', Number(date.slice(-2))));
    button.onclick = () => { selectedDate = date; loadCalendar(); };
    $('#days').append(button);
  });
  $('#day-label').textContent = fmt(new Date(selectedDate + 'T12:00:00Z'), { weekday: 'long', day: 'numeric', month: 'long' });
}
const statuses = { 0: 'החוג מלא', 1: 'אפשר להצטרף לרשימת המתנה', 2: 'ההרשמה אושרה', 3: 'ההרשמה פתוחה', 4: 'ברשימת ההמתנה', 5: 'נותרו מקומות מעטים', 6: 'ההרשמה טרם נפתחה', 7: 'ההרשמה נסגרה', 8: 'ההרשמה אושרה', 9: 'נקבעה תזכורת', 10: 'התפנה מקום מרשימת ההמתנה' };
function renderClasses() {
  const q = $('#search').value.toLocaleLowerCase().trim(), type = $('#type-filter').value;
  const filtered = classes.filter(a => a.date === selectedDate && (!type || a.name === type) && (!q || (a.name + ' ' + a.instructor).toLocaleLowerCase().includes(q))).sort((a, b) => a.startsAt - b.startsAt);
  $('#result-count').textContent = filtered.length === 1 ? 'חוג אחד' : `${filtered.length} חוגים`;
  const list = $('#classes'); list.replaceChildren();
  if (!filtered.length) return list.append(el('div', 'empty', calendarLoading ? 'החוגים ליום הנבחר נטענים מפיזיקל…' : calendarError || (loadedDays.has(selectedDate) ? 'לא נמצאו חוגים ביום ובסינון שנבחרו.' : 'לטעינת החוגים ליום הזה יש ללחוץ על ״עדכון לוח החוגים״.')));
  for (const a of filtered) {
    const full = [0, 1].includes(a.status);
    const row = el('article', 'class-row' + (full ? ' is-full' : ''));
    const time = el('div', 'class-time'); time.append(el('strong', '', a.time), el('small', '', minutesText(a.duration)));
    const stripe = el('div', 'class-stripe' + (/יוגה/.test(a.name) ? ' yoga' : /פילאטיס|מכשירים|לאטיס/.test(a.name) ? ' pilates' : /מים|בריכה|שחייה/.test(a.name) ? ' water' : ''));
    const details = el('div', 'class-details'), title = el('h3', '', a.name), meta = el('p', '', [a.instructor, a.location].filter(Boolean).join(' · '));
    title.dir = 'auto'; meta.dir = 'auto'; details.append(title, meta);
    const occupancy = a.registered !== null && a.registered !== undefined && a.capacity ? `${a.registered} נרשמו מתוך ${a.capacity} מקומות` : 'מספר הנרשמים אינו זמין';
    const capacity = el('div', 'occupancy');
    capacity.append(el('span', '', occupancy));
    if (full) capacity.append(el('span', 'full-badge', 'החוג מלא'));
    details.append(capacity);
    const status = el('span', 'status' + ([3, 5].includes(a.status) ? ' open' : '')); status.append(el('i'), el('span', '', statuses[a.status] || 'יש לבדוק בפיזיקל'));
    const saved = state.rules.find(r => r.lessonId === a.lessonId && r.weekday === a.weekday && r.time === a.time);
    const manual = a.paid || a.seatsMap;
    const registered = [2, 4, 8, 10].includes(a.status);
    const scheduled = scheduledJobs().some(j => j.key === a.key);
    const button = el('button', 'repeat' + (registered ? ' saved' : '') + (full ? ' waitlist-button' : ''), scheduled ? 'צפייה בתזמון' : registered ? 'צפייה בהרשמה' : manual ? 'הרשמה דרך פיזיקל' : a.status === 1 ? 'הצטרפות לרשימת המתנה' : a.status === 0 ? 'החוג מלא · אין רשימת המתנה' : a.status === 6 ? 'הרשמה בפתיחה' : 'הרשמה');
    button.disabled = !scheduled && (manual || a.status === 0); button.title = manual ? 'לחוג הזה נדרשת רכישה או בחירת מקום בפיזיקל' : a.status === 0 ? 'אין רשימת המתנה לחוג הזה' : '';
    button.onclick = () => (registered || scheduled) ? setView('upcoming') : openRule(a);
    row.append(time, stripe, details, status, button); list.append(row);
  }
}
function openRule(a) {
  selectedClass = a; $('#rule-form').reset(); $('#rule-error').textContent = '';
  $('#waitlist').checked = a.status === 1;
  $('#single-choice-label').textContent = a.status === 6 ? 'הרשמה בפתיחה — למפגש הזה בלבד' : 'למפגש הזה בלבד';
  const title = el('strong', '', a.name); title.dir = 'auto';
  $('#rule-summary').replaceChildren(title, el('div', '', fmt(a.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' · ' + minutesText(a.duration)), el('div', '', a.instructor));
  $('#next-booking').textContent = a.dueAt > Date.now() ? 'ניסיון ההרשמה הבא: ' + fmt(a.dueAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' (שעון ישראל)' : 'מועד ההרשמה האוטומטית למפגש הזה כבר חלף. ההרשמה השבועית תתחיל במועד ההרשמה הבא שטרם חלף.';
  const w = a.clubWindow;
  const differs = w && (w.NumberOfDays * 1440 + w.NumberOfMinutes !== 1440);
  $('#window-note').textContent = differs ? `מועד פתיחת ההרשמה בקאנטרי שונה: ${daysText(w.NumberOfDays)} ו־${minutesText(w.NumberOfMinutes)} לפני החוג. המערכת עדיין תנסה להירשם בדיוק 24 שעות לפני תחילת החוג.` : 'אפשר להשהות או להסיר את ההרשמה השבועית בכל עת.';
  updateBookingMode(); $('#rule-dialog').showModal();
}
function updateBookingMode() {
  const mode = $('[name="booking-mode"]:checked').value;
  const recurring = mode === 'recurring', scheduled = !recurring && selectedClass.status === 6;
  $('#scheduled-note').hidden = !scheduled;
  const opensAt = selectedClass.opensAt ?? selectedClass.dueAt;
  $('#scheduled-note').textContent = (selectedClass.openingEstimated ? 'מועד פתיחה משוער: ' : 'פתיחת ההרשמה: ') + fmt(opensAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '. ניסיון אוטומטי גם כשהאפליקציה סגורה. האישור תלוי במקום פנוי.' + (selectedClass.openingEstimated ? ' הקאנטרי לא מסר מועד פתיחה; הניסיון מתוזמן ל־24 שעות לפני החוג.' : '');
  $('#recurring-options').hidden = !recurring;
  $('#single-note').hidden = recurring || scheduled;
  const waitlisting = selectedClass.status === 1;
  $('#waitlist').disabled = !recurring && waitlisting;
  if (!recurring && waitlisting) $('#waitlist').checked = true;
  $('#single-note').textContent = waitlisting ? 'החוג מלא. לחיצה על אישור תשלח בקשת הצטרפות לרשימת ההמתנה בפיזיקל.' : 'לחיצה על אישור תשלח בקשת הרשמה בפיזיקל למפגש הזה בלבד. ' + (statuses[selectedClass.status] || '');
  const exists = state.rules.some(r => r.lessonId === selectedClass.lessonId && r.weekday === selectedClass.weekday && r.time === selectedClass.time);
  $('#register-submit').textContent = scheduled ? 'שמירת הרשמה בפתיחה' : recurring ? (exists ? 'כבר הוגדרה הרשמה שבועית לחוג הזה' : 'שמירת הרשמה שבועית') : waitlisting ? 'הצטרפות לרשימת המתנה' : 'אישור הרשמה למפגש הזה';
  $('#register-submit').disabled = scheduled ? !state.connected || selectedClass.status !== 6 || opensAt <= Date.now() || opensAt >= selectedClass.startsAt : recurring ? exists : !state.connected || ![1, 3, 5].includes(selectedClass.status) || selectedClass.startsAt <= Date.now();
}
document.querySelectorAll('[name="booking-mode"]').forEach(input => { input.onchange = updateBookingMode; });
$('#rule-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('#rule-error').textContent = '';
  try {
    const mode = $('[name="booking-mode"]:checked').value;
    const recurring = mode === 'recurring', scheduled = !recurring && selectedClass.status === 6;
    const result = await api(scheduled ? 'bookings/schedule' : recurring ? 'rules' : 'bookings/register', { method: 'POST', body: JSON.stringify({ key: selectedClass.key, date: selectedClass.date, start: week, waitlist: $('#waitlist').checked, pinInstructor: $('#pin-instructor').checked }) });
    $('#rule-dialog').close();
    toast(scheduled ? 'התזמון נשמר. המערכת תנסה להירשם כשייפתח הרישום.' : recurring ? (state.live ? 'ההרשמה השבועית נשמרה' : 'ההגדרה נשמרה. ההרשמה האוטומטית השבועית מושהית.') : result.status === 'waitlisted' ? 'ההצטרפות לרשימת ההמתנה אושרה בפיזיקל' : 'ההרשמה אושרה בפיזיקל');
    await refreshState();
    if (!recurring) { await setView('upcoming'); }
  } catch (e) { $('#rule-error').textContent = heText(e.message); }
  finally { button.disabled = false; }
};
function renderRules() {
  const list = $('#rules-list'); list.replaceChildren();
  if (!state.rules.length) return list.append(el('div', 'empty', 'עדיין לא הוגדרה הרשמה שבועית. לצד החוג הרצוי לוחצים על ״הרשמה״ ואז בוחרים ״הרשמה אוטומטית בכל שבוע״.'));
  for (const r of state.rules) {
    const card = el('article', 'rule-card'), info = el('div'), title = el('h3', '', r.name); title.dir = 'auto';
    info.append(title, el('p', '', `בכל ${r.weekday === 6 ? 'שבת' : 'יום ' + days[r.weekday]} בשעה ${r.time} (שעון ישראל) · ${r.enabled ? 'פעילה' : 'מושהית'}`), el('p', '', `ניסיון הרשמה 24 שעות לפני החוג · ${r.waitlist ? 'הצטרפות לרשימת המתנה מופעלת' : 'ללא הצטרפות לרשימת המתנה'} · ${r.pinInstructor ? 'רק עם המדריך או המדריכה שנבחרו' : 'עם כל מדריך או מדריכה'}`));
    const next = state.jobs.filter(j => j.ruleId === r.id && ['pending', 'retry', 'running'].includes(j.status)).sort((a,b) => a.dueAt-b.dueAt)[0];
    info.append(el('p', '', next ? 'ניסיון ההרשמה הבא: ' + fmt(next.dueAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'מועד ההרשמה הבא יוצג לאחר עדכון לוח החוגים.'));
    const actions = el('div', 'card-actions'), toggle = el('button', '', r.enabled ? 'השהיה' : 'חידוש ההרשמה'), remove = el('button', '', 'הסרה');
    toggle.onclick = async () => { try { await api('rules/' + r.id, { method: 'PATCH', body: JSON.stringify({ enabled: !r.enabled }) }); await refreshState(); toast(r.enabled ? 'ההרשמה השבועית הושהתה. הרשמות שכבר אושרו נשארות בתוקף.' : 'ההרשמה השבועית חודשה. ניסיונות ההרשמה הבאים יתוזמנו בהתאם ללוח החוגים.'); } catch (e) { error(heText(e.message)); } };
    remove.onclick = async () => { try { await api('rules/' + r.id, { method: 'DELETE' }); await refreshState(); toast('ההרשמה השבועית הוסרה. הרשמות שכבר אושרו בקאנטרי נשארות בתוקף.'); } catch (e) { error(heText(e.message)); } };
    actions.append(toggle, remove); card.append(info, actions); list.append(card);
  }
}
const jobLabels = { pending: 'ממתינה למועד ההרשמה', retry: 'ממתינה לניסיון נוסף', running: 'ההרשמה מתבצעת', registered: 'ההרשמה אושרה', waitlisted: 'ברשימת ההמתנה', failed: 'ההרשמה לא הושלמה', missed: 'מועד ההרשמה חלף', cancelled: 'הניסיון בוטל' };
function renderJobs() {
  const list = $('#jobs-list'); list.replaceChildren();
  if (!state.jobs.length) return list.append(el('div', 'empty', 'עדיין אין ניסיונות הרשמה. לאחר הגדרת הרשמה שבועית יוצגו כאן מועדי ההרשמה הבאים.'));
  for (const j of [...state.jobs].sort((a,b) => a.dueAt-b.dueAt)) {
    const card = el('article', 'job-card'), info = el('div'), title = el('h3', '', j.data.name); title.dir = 'auto';
    info.append(title, el('p', '', 'מועד החוג: ' + fmt(j.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })), el('p', '', 'מועד ניסיון ההרשמה: ' + fmt(j.dueAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · שעון ישראל'), el('p', '', heText(j.message) || (state.live ? 'בהמתנה למועד פתיחת ההרשמה' : 'ההרשמה האוטומטית מושהית — לא תישלח בקשת הרשמה')));
    card.append(info, el('span', 'job-status ' + j.status, jobLabels[j.status] || 'מצב ההרשמה אינו זמין')); list.append(card);
  }
}
function setView(name) {
  view = name;
  closePhoneMenu();
  if (window.matchMedia('(max-width: 1000px)').matches) window.scrollTo(0, 0);
  const titles = { upcoming: ['ההרשמות שלי', 'ההרשמות ורשימות ההמתנה שלך, לפי הנתונים בפיזיקל.'], schedule: ['חיפוש חוג', '1. בוחרים יום. 2. בוחרים חוג. 3. לוחצים על ״הרשמה״.'], rules: ['הרשמה שבועית', 'ניהול, השהיה או הסרה של ההרשמה השבועית לחוגים.'], activity: ['פעולות הרשמה', 'מועדי ההרשמה הבאים, ניסיונות הרשמה והתוצאות שאושרו.'] };
  for (const key of Object.keys(titles)) $('#' + key + '-view').hidden = key !== name;
  document.querySelectorAll('.nav').forEach(n => { n.classList.toggle('active', n.dataset.view === name); n.setAttribute('aria-current', n.dataset.view === name ? 'page' : 'false'); });
  $('#breadcrumb').textContent = { upcoming: 'ההרשמות שלי', schedule: 'לוח החוגים', rules: 'הרשמה שבועית', activity: 'פעולות הרשמה' }[name];
  $('#page-title').replaceChildren(document.createTextNode(titles[name][0]), el('span', '', '.'));
  $('#page-description').textContent = titles[name][1]; $('#refresh').hidden = name !== 'schedule';
  if (name === 'upcoming') return loadBookings();
}
async function loadBookings() {
  $('#refresh-bookings').disabled = true;
  $('#bookings-list').replaceChildren(el('div', 'empty', 'ההרשמות שלך נבדקות מול פיזיקל…'));
  try {
    if (!state.connected) throw new Error('לצפייה בהרשמות יש להתחבר לחשבון פיזיקל.');
    const data = await api('bookings'); upcoming = data.classes;
    renderBookings(); error('');
  } catch (e) { renderBookings(); error(heText(e.message)); }
  finally { $('#refresh-bookings').disabled = false; }
}
function scheduledJobs() { return state.jobs.filter(j => j.ruleId === 'one-time' && ['pending', 'retry', 'running'].includes(j.status)).sort((a,b) => a.dueAt - b.dueAt); }
function renderBookings() {
  const list = $('#bookings-list'); list.replaceChildren();
  for (const job of scheduledJobs()) {
    const card = el('article', 'rule-card'), info = el('div');
    info.append(el('h3', '', job.data.name), el('p', '', 'מפגש: ' + fmt(job.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })), el('p', '', 'ניסיון הרשמה בפתיחה: ' + fmt(job.dueAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })), el('p', '', job.status === 'running' ? 'ההרשמה מתבצעת — האישור עדיין לא התקבל' : 'מתוזמנת — עדיין אין הרשמה מאושרת'));
    const cancel = el('button', 'button secondary', 'ביטול התזמון'); cancel.disabled = job.status === 'running';
    cancel.onclick = async () => { cancel.disabled = true; try { await api('bookings/unschedule', { method: 'POST', body: JSON.stringify({ key: job.key, date: job.data.date }) }); await refreshState(); toast('התזמון בוטל. לא יישלח ניסיון הרשמה למפגש הזה.'); } catch (e) { error(heText(e.message)); cancel.disabled = false; } };
    card.append(info, cancel); list.append(card);
  }
  if (!upcoming.length && !scheduledJobs().length) return list.append(el('div', 'empty', 'אין הרשמות או מקומות ברשימות המתנה ל־60 הימים הקרובים.'));
  for (const a of upcoming.sort((a,b) => a.startsAt-b.startsAt)) {
    const card = el('article', 'rule-card'), info = el('div'), title = el('h3', '', a.name); title.dir = 'auto';
    info.append(title, el('p', '', fmt(a.startsAt, { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })), el('p', '', [a.instructor, a.location].filter(Boolean).join(' · ')), el('p', '', statuses[a.status]));
    const cancel = el('button', 'button danger', a.status === 8 ? 'מועד הביטול חלף' : 'ביטול ההרשמה'); cancel.disabled = a.status === 8;
    cancel.onclick = () => {
      cancellingClass = a; $('#cancel-error').textContent = '';
      $('#cancel-summary').replaceChildren(el('strong', '', a.name), el('div', '', fmt(a.startsAt, { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })));
      $('#cancel-dialog').showModal();
    };
    card.append(info, cancel); list.append(card);
  }
}
$('#refresh-bookings').onclick = loadBookings;
$('#cancel-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    await api('bookings/cancel', { method:'POST', body:JSON.stringify({ key:cancellingClass.key, date:cancellingClass.date }) });
    $('#cancel-dialog').close(); toast('ביטול ההרשמה אושר בפיזיקל'); await refreshState(); await loadBookings();
  } catch (e) { $('#cancel-error').textContent = heText(e.message); }
  finally { button.disabled = false; }
};
document.querySelectorAll('.nav').forEach(n => { n.onclick = () => setView(n.dataset.view); });
document.querySelectorAll('[data-close]').forEach(n => { n.onclick = () => $('#' + n.dataset.close).close(); });
$('#prev-week').onclick = () => { week = shift(week, -7); selectedDate = week; loadCalendar(); };
$('#next-week').onclick = () => { week = shift(week, 7); selectedDate = week; loadCalendar(); };
$('#today').onclick = () => { week = shift(today, -new Date(today + 'T12:00:00Z').getUTCDay()); selectedDate = today; loadCalendar(); };
$('#refresh').onclick = async () => { await loadCalendar(true); try { await refreshState(); } catch (e) { error(heText(e.message)); } };
$('#search').oninput = renderClasses; $('#type-filter').onchange = renderClasses;
$('#account-button').onclick = () => { $('#account-form').reset(); $('#account-error').textContent = ''; $('#account-dialog').showModal(); };
$('#account-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    const fields = new FormData(event.target);
    await api('account', { method: 'POST', body: JSON.stringify({ phone: fields.get('phone'), password: fields.get('password') }) });
    event.target.reset(); $('#account-dialog').close(); await refreshState(); await loadCalendar(); toast('החשבון מחובר לקאנטרי');
  } catch (e) { $('#account-error').textContent = heText(e.message); }
  finally { button.disabled = false; }
};
$('#disconnect').onclick = async () => {
  try { await api('account', { method: 'DELETE' }); clearAccountData(); $('#auth-dialog').showModal(); toast('החשבון נותק מכל הטלפונים וההרשמה השבועית הושהתה'); } catch (e) { $('#account-error').textContent = heText(e.message); }
};
$('#signout').onclick = async () => {
  try { await api('logout', { method: 'POST' }); clearAccountData(); $('#auth-form').reset(); $('#auth-error').textContent = ''; $('#auth-dialog').showModal(); toast('יצאת מהחשבון בטלפון הזה. ההרשמה השבועית ממשיכה לפעול, אם היא מופעלת.'); }
  catch (e) { $('#account-error').textContent = heText(e.message); }
};
$('#auth-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { const fields = new FormData(event.target); await api('auth', { method: 'POST', body: JSON.stringify({ phone: fields.get('phone'), password: fields.get('password') }) }); event.target.reset(); clearAccountData(); $('#auth-dialog').close(); await initialize(); toast('הכניסה הצליחה. החשבון יישאר מחובר בטלפון הזה.'); }
  catch (e) { $('#auth-error').textContent = heText(e.message); } finally { button.disabled = false; }
};
$('#auth-dialog').addEventListener('cancel', event => event.preventDefault());
async function initialize() { try { await refreshState(); await loadCalendar(); } catch (e) { if (!$('#auth-dialog').open) error(heText(e.message)); } }
renderDays(); initialize();
setInterval(() => { if (!document.hidden && !$('#auth-dialog').open) refreshState().catch(() => {}); }, 15000);

// Keep the user's password visible only when they explicitly request it.
document.querySelectorAll('.password-toggle').forEach(button => { button.onclick = () => { const input = button.closest('form').querySelector('[name="password"]'); const visible = input.type === 'password'; input.type = visible ? 'text' : 'password'; button.textContent = visible ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'; button.setAttribute('aria-pressed', String(visible)); }; });

// Browser validation messages follow the app's language, even on an English phone.
document.querySelectorAll('input[required]').forEach(input => {
  input.addEventListener('invalid', () => { input.setCustomValidity(input.validity.valueMissing ? (input.name === 'phone' ? 'יש להזין מספר טלפון.' : 'יש להזין סיסמה לפיזיקל.') : 'יש לבדוק את הערך שהוזן.'); });
  input.addEventListener('input', () => input.setCustomValidity(''));
});

function closePhoneMenu() {
  document.querySelector('.sidebar').classList.remove('menu-open');
  $('#phone-menu').setAttribute('aria-expanded', 'false');
}
$('#phone-menu').onclick = () => {
  const open = document.querySelector('.sidebar').classList.toggle('menu-open');
  $('#phone-menu').setAttribute('aria-expanded', String(open));
};

// Reserve space for the bottom navigation, including when text is enlarged.
const phoneNavigation = document.querySelector('.sidebar nav');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--phone-nav-height', phoneNavigation.getBoundingClientRect().height + 'px');
}).observe(phoneNavigation);
