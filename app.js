const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  apiUrl: 'https://api.project-register.helsinginhitsaus.fi',
  user: null,
  projects: [],
  customers: [],
  lookups: {},
  audit: [],
  users: [],
  oneDrive: { configured: false, connected: false },
  view: 'all',
  selectedNumber: null,
  editingNumber: null,
  operationBusy: false,
  editableOnly: false,
  tableZoom: 100,
  tableFullscreen: false,
  numberSortDirection: 'desc',
  otherActiveUsers: [],
  backendReady: false,
  microsoftSignInQueued: false,
  microsoftRedirecting: false,
  backendWakeFailed: false
};

let pendingDeleteChallenge = null;
let openerFallbackProject = null;
let openerAttemptSequence = 0;
let openerLaunchBusy = false;

const OPENER_INSTALL_KEY = 'projectRegisterOpenerInstalledV2';

const viewInfo = {
  all: ['All Projects', ''],
  plan: ['Projects in Plan', 'Projects currently in planning.'],
  progress: ['Projects in Progress', 'Active projects.'],
  completed: ['Completed Projects', 'Completed projects.'],
  refusal: ['Projects in Refusal', 'Rejected projects.'],
  overdue: ['Updates Required', 'Projects with overdue schedule information that needs review.'],
  customers: ['Customers', 'Customer contacts.'],
  audit: ['Audit Log', 'Project change history.'],
  users: ['Users & Access', 'Manage users, passwords and access rights.']
};

const projectColumns = [
  ['orderNumber', 'Order No.'], ['projectName', 'Project'], ['customer', 'Customer'], ['status', 'Status'],
  ['activityType', 'Activity'], ['customerRepresentative', 'Representative'], ['customerPhone', 'Phone'],
  ['customerEmail', 'Email'], ['projectManager', 'Project Manager'], ['workLocation', 'Work Location'],
  ['startPlan', 'Plan Start'], ['endPlan', 'Plan End'], ['durationPlan', 'Plan Duration'],
  ['startFact', 'Fact Start'], ['endFact', 'Fact End'], ['durationFact', 'Fact Duration'],
  ['costExpected', 'Expected Cost'], ['costActual', 'Actual Cost'], ['currency', 'Currency'],
  ['contract', 'Contract / Document'], ['folderLink', 'Project Folder']
];

const roleOptions = [
  ['viewer', 'View all projects — read only'],
  ['pm', 'Project manager — edit own projects'],
  ['localAdmin', 'Local administrator — edit all projects']
];

const roleNames = {
  admin: 'Main administrator',
  localAdmin: 'Local administrator',
  pm: 'Project manager',
  viewer: 'View only'
};

function api(path) { return `${state.apiUrl}${path}`; }

// Wake the free backend as soon as the page opens, before the user enters a PIN.
void fetch(api('/api/health'), { cache: 'no-store' }).catch(() => {});

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  let response;
  try { response = await fetch(api(path), { ...options, headers, credentials: 'include' }); }
  catch { throw new Error('Connection unavailable. Please try again.'); }
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401 && !['/api/auth/login', '/api/auth/me'].includes(path)) clearSession();
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginRequest(password) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await request('/api/auth/login', {
        method: 'POST',
        body: { password }
      });
    } catch (error) {
      lastError = error;
      if (error.message !== 'Connection unavailable. Please try again.' || attempt === 4) throw error;
      setText($('#busyTitle'), attempt === 1 ? 'Connecting…' : 'Still connecting…');
      setText($('#busyText'), 'The server is starting. You do not need to press Log in again.');
      await wait(attempt * 1500);
    }
  }
  throw lastError;
}
function cleanMicrosoftAuthParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_code');
  url.searchParams.delete('auth_error');
  const clean = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, clean);
}

async function completeMicrosoftSignIn() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_code') || '';
  const authError = url.searchParams.get('auth_error') || '';
  if (!code && !authError) return false;

  cleanMicrosoftAuthParams();

  if (authError) {
    showNotice(authError, 'error');
    return true;
  }

  if (!beginBusy('Signing in with Microsoft…', 'Checking your Project Register access.')) return true;
  try {
    const r = await request('/api/auth/microsoft/exchange', {
      method: 'POST',
      body: { code }
    });
    state.user = r.user;
    setText($('#busyTitle'), 'Loading projects…');
    setText($('#busyText'), 'Preparing the project register.');
    await loadCoreData();
    showNotice(`Signed in as ${state.user.username}.`);
  } catch (error) {
    clearSession();
    showNotice(error.message, 'error');
  } finally {
    endBusy();
  }
  return true;
}

function updateLandingMicrosoftButton() {
  const button = $('#landingMicrosoftLoginBtn');
  const spinner = $('#landingMicrosoftSpinner');
  const label = $('#landingMicrosoftText');
  if (!button || !spinner || !label) return;

  button.disabled = Boolean(state.microsoftRedirecting);
  button.classList.toggle('is-preparing', !state.backendReady || state.microsoftRedirecting);
  spinner.classList.toggle('hidden', state.backendReady && !state.microsoftRedirecting);

  if (state.microsoftRedirecting) {
    setText(label, 'Opening Microsoft sign-in…');
  } else if (state.backendWakeFailed) {
    setText(label, 'Try sign in again');
  } else if (!state.backendReady && state.microsoftSignInQueued) {
    setText(label, 'Starting secure server…');
  } else if (!state.backendReady) {
    setText(label, 'Preparing sign in…');
  } else {
    setText(label, 'Sign in with Microsoft');
  }
}

function performMicrosoftRedirect() {
  if (state.microsoftRedirecting) return;
  state.microsoftSignInQueued = false;
  state.microsoftRedirecting = true;
  state.backendWakeFailed = false;
  updateLandingMicrosoftButton();
  setLandingStatus('Opening your company Microsoft sign-in…');
  window.location.assign(api('/api/auth/microsoft/start'));
}

function startMicrosoftSignIn() {
  if (state.operationBusy || state.microsoftRedirecting) return;

  if (state.backendReady) {
    performMicrosoftRedirect();
    return;
  }

  state.microsoftSignInQueued = true;
  state.backendWakeFailed = false;
  updateLandingMicrosoftButton();
  setLandingStatus('Secure server is starting. Sign-in will continue automatically.');
  void ensureBackendReady();
}


function escapeText(value) { return value == null ? '' : String(value); }
function setText(el, value) { if (el) el.textContent = escapeText(value); }

function showNotice(message, type = 'ok') {
  const el = $('#notice');
  setText(el, message);
  el.classList.remove('hidden', 'notice-error');
  if (type === 'error') el.classList.add('notice-error');
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => el.classList.add('hidden'), 5000);
}

function operationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function beginBusy(title, detail = 'Please wait. Do not close this page.') {
  if (state.operationBusy) return false;
  state.operationBusy = true;
  setText($('#busyTitle'), title);
  setText($('#busyText'), detail);
  $('#busyOverlay').classList.remove('hidden');
  document.body.classList.add('is-busy');
  $('#saveProjectBtn').disabled = true;
  $('#deleteProjectBtn').disabled = true;
  return true;
}

function endBusy() {
  state.operationBusy = false;
  $('#busyOverlay').classList.add('hidden');
  document.body.classList.remove('is-busy');
  $('#saveProjectBtn').disabled = false;
  $('#deleteProjectBtn').disabled = false;
}

function normalizeRoles(value) {
  if (Array.isArray(value)) return [...new Set(value.filter(Boolean))];
  if (value && Array.isArray(value.roles) && value.roles.length) return [...new Set(value.roles.filter(Boolean))];
  if (value?.role) return [value.role];
  if (typeof value === 'string' && value) return [value];
  return [];
}

function roleLabel(role) {
  return roleNames[role] || role || '';
}

function rolesLabel(value) {
  const roles = normalizeRoles(value);
  const order = ['admin', 'localAdmin', 'pm', 'viewer'];
  return order.filter(role => roles.includes(role)).map(roleLabel).join(' · ');
}

function canEditProjects() {
  return state.user?.access === 'edit_all' || state.user?.access === 'edit_own';
}

function canEditAll() {
  return state.user?.access === 'edit_all';
}

function canOperateAdminTools() {
  const roles = normalizeRoles(state.user);
  return roles.includes('admin') || roles.includes('localAdmin');
}

function canEditCustomers() {
  return state.user?.access === 'edit_all' || state.user?.access === 'edit_own';
}

function clearSession({ backendReady = state.backendReady } = {}) {
  state.user = null;
  state.projects = [];
  state.customers = [];
  state.audit = [];
  state.users = [];
  state.selectedNumber = null;
  state.editableOnly = false;
  state.tableFullscreen = false;
  state.tableZoom = 100;
  state.otherActiveUsers = [];
  state.backendReady = Boolean(backendReady);
  // Remove the legacy browser token if this browser used an older version.
  sessionStorage.removeItem('projectRegisterToken');
  if (state.view === 'users') state.view = 'all';
  updateAuthUi();
  setLandingStatus('');
  setLandingReady(state.backendReady);
  render();
}

function setLandingStatus(message = '', error = false) {
  const el = $('#landingStatus');
  if (!el) return;
  setText(el, message);
  el.classList.toggle('error', Boolean(error));
}

function setLandingReady(ready) {
  state.backendReady = Boolean(ready);
  $('#landingEmergencyBtn').disabled = !state.backendReady;
  updateLandingMicrosoftButton();
}

function renderOtherActiveUsers() {
  const wrap = $('#otherActiveUsers');
  if (!wrap) return;
  const others = state.user ? state.otherActiveUsers : [];
  wrap.classList.toggle('hidden', !others.length);
  wrap.parentElement?.classList.toggle('has-online-peers', Boolean(others.length));
  wrap.replaceChildren();
  for (const username of others) {
    const chip = document.createElement('span');
    chip.className = 'online-peer';
    chip.textContent = username;
    chip.title = 'Currently active on Project Register';
    wrap.append(chip);
  }
}

let presenceRequestInFlight = false;
async function refreshPresence() {
  if (!state.user || presenceRequestInFlight || document.visibilityState === 'hidden') return;
  presenceRequestInFlight = true;
  try {
    const data = await request('/api/presence', { method: 'POST', cache: 'no-store' });
    if (!state.user) return;
    const names = Array.isArray(data.others) ? data.others : [];
    state.otherActiveUsers = [...new Set(names
      .filter(name => typeof name === 'string' && name.trim() && name !== state.user.username))];
    renderOtherActiveUsers();
  } catch (error) {
    console.warn('Active user presence unavailable:', error.message);
  } finally {
    presenceRequestInFlight = false;
  }
}

function updateAuthUi() {
  const loggedIn = Boolean(state.user);
  $('#loginLanding').classList.toggle('hidden', loggedIn);
  $('#appShell').classList.toggle('hidden', !loggedIn);
  $('#authLoggedOut').classList.toggle('hidden', loggedIn);
  $('#authLoggedIn').classList.toggle('hidden', !loggedIn);
  setText($('#authUserName'), state.user?.username || '');
  setText($('#authUserRole'), rolesLabel(state.user));
  setText($('#authBtn'), loggedIn ? state.user.username : 'Sign in');
  renderOtherActiveUsers();
  $('#usersTab').classList.toggle('hidden', !state.user?.canManageUsers);
}

function isWakeError(error) {
  return /Connection unavailable|Request failed \((502|503|504)\)/i.test(String(error?.message || ''));
}

let backendWakePromise = null;

async function restoreSession() {
  setLandingReady(false);
  state.backendWakeFailed = false;
  updateLandingMicrosoftButton();
  setLandingStatus('');

  let lastError = null;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let user;
      try {
        ({ user } = await request('/api/auth/me', { signal: controller.signal }));
      } finally {
        clearTimeout(timer);
      }
      state.backendReady = true;
      state.user = user;
      updateLandingMicrosoftButton();
      await loadCoreData();
      setLandingStatus('');
      return true;
    } catch (error) {
      lastError = error;

      if (!isWakeError(error)) {
        state.backendReady = true;
        state.backendWakeFailed = false;
        updateLandingMicrosoftButton();

        if (state.microsoftSignInQueued) {
          performMicrosoftRedirect();
          return true;
        }

        clearSession({ backendReady: true });
        setLandingStatus('');
        return true;
      }

      state.backendReady = false;
      updateLandingMicrosoftButton();
      setLandingStatus(state.microsoftSignInQueued
        ? `Secure server is starting… (attempt ${attempt}/12). Sign-in will continue automatically.`
        : `Connecting to secure server… (attempt ${attempt}/12)`);
      await wait(3000);
    }
  }

  state.backendReady = false;
  state.backendWakeFailed = true;
  state.microsoftSignInQueued = false;
  updateLandingMicrosoftButton();
  setLandingStatus('Secure server is taking longer than usual. Click Try sign in again.', true);
  return false;
}

function ensureBackendReady() {
  if (state.backendReady) return Promise.resolve(true);
  if (backendWakePromise) return backendWakePromise;
  backendWakePromise = restoreSession().finally(() => { backendWakePromise = null; });
  return backendWakePromise;
}

let lastCoreDataRefreshAt = 0;
let coreDataRefreshInFlight = false;
async function loadCoreData() {
  if (!state.user) return;
  const bootstrap = await request('/api/bootstrap', { cache: 'no-store' });
  state.user = bootstrap.user || state.user;
  state.projects = bootstrap.projects || [];
  state.customers = bootstrap.customers || [];
  state.lookups = bootstrap.lookups || {};
  state.oneDrive = bootstrap.oneDrive || { configured: false, connected: false };
  lastCoreDataRefreshAt = Date.now();
  if (state.view === 'audit') await loadAudit();
  if (state.view === 'users' && state.user.canManageUsers) await loadUsers();
  render();
  void refreshPresence();
}

// Refresh stale project lists without interrupting an open editor.
async function refreshCoreDataIfChanged() {
  if (!state.user || state.operationBusy || coreDataRefreshInFlight) return;
  if (document.visibilityState === 'hidden' || document.querySelector('dialog[open]')) return;
  if (Date.now() - lastCoreDataRefreshAt < 60000) return;
  coreDataRefreshInFlight = true;
  lastCoreDataRefreshAt = Date.now();
  try {
    const bootstrap = await request('/api/bootstrap', { cache: 'no-store' });
    if (!state.user || state.operationBusy || document.querySelector('dialog[open]')) return;
    const projects = bootstrap.projects || [];
    const customers = bootstrap.customers || [];
    if (JSON.stringify(projects) === JSON.stringify(state.projects) &&
        JSON.stringify(customers) === JSON.stringify(state.customers)) return;
    state.user = bootstrap.user || state.user;
    state.projects = projects;
    state.customers = customers;
    state.lookups = bootstrap.lookups || {};
    state.oneDrive = bootstrap.oneDrive || { configured: false, connected: false };
    render();
  } catch (error) {
    console.warn('Project register background refresh failed:', error.message);
  } finally {
    coreDataRefreshInFlight = false;
  }
}

async function loadAudit() {
  const r = await request('/api/audit');
  state.audit = r.auditLog || [];
}

async function loadUsers() {
  if (!state.user?.canManageUsers) return;
  const r = await request('/api/users');
  state.users = r.users || [];
}

async function refreshLookups() {
  const r = await request('/api/lookups');
  state.lookups = r.lookups || {};
}

function projectGroup(project) {
  if (project.statusGroup) return project.statusGroup;
  if (['In plan','Offer Preparation','Awaiting Client Decision'].includes(project.status)) return 'plan';
  if (['Confirmed','In Progress'].includes(project.status)) return 'progress';
  if (project.status === 'Completed') return 'completed';
  if (project.status === 'Rejected') return 'refusal';
  return 'unknown';
}

// Compare ISO date strings as calendar dates, not instants, to avoid timezone drift.
function todayLocalIso() {
  const d = new Date();
  const pad = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysSince(isoDate, today = todayLocalIso()) {
  const asUtc = v => Date.parse(`${v}T00:00:00Z`);
  return Math.floor((asUtc(today) - asUtc(isoDate)) / 86400000);
}

function overdueProjectInfo(project, today = todayLocalIso()) {
  if (project.status === 'Rejected' || project.status === 'Completed') return null;
  const reasons = [];
  const dueDates = [];

  if (project.startPlan && project.startPlan < today && !project.startFact) {
    reasons.push('Actual start date missing');
    dueDates.push(project.startPlan);
  }
  if (project.endPlan && project.endPlan < today) {
    reasons.push(project.endFact ? 'Project status update required' : 'Project completion update required');
    dueDates.push(project.endPlan);
  }
  if (!reasons.length) return null;
  return { reasons, days: daysSince(dueDates.sort()[0], today) };
}

function compareProjectNumbers(a, b) {
  const aRaw = String(a.orderNumber || '');
  const bRaw = String(b.orderNumber || '');
  const aNumber = Number(aRaw.replace(/\D/g, '')) || 0;
  const bNumber = Number(bRaw.replace(/\D/g, '')) || 0;
  const delta = aNumber - bNumber || aRaw.localeCompare(bRaw, undefined, { numeric: true });
  return state.numberSortDirection === 'asc' ? delta : -delta;
}

function filteredProjects() {
  const q = $('#searchInput').value.trim().toLowerCase();
  return state.projects
    .filter(p => {
      if (state.view === 'overdue') {
        if (!overdueProjectInfo(p)) return false;
      } else if (state.view !== 'all' && projectGroup(p) !== state.view) return false;
      if (state.editableOnly && !p.canEdit) return false;
      if (!q) return true;
      return Object.values(p).some(v => String(v ?? '').toLowerCase().includes(q));
    })
    .sort(compareProjectNumbers);
}

function renderMetrics() {
  const counts = { all: state.projects.length, plan: 0, progress: 0, completed: 0, refusal: 0 };
  state.projects.forEach(p => { const g = projectGroup(p); if (g in counts) counts[g]++; });
  const metrics = $('#metrics');
  metrics.replaceChildren();
  const items = [['all','Total'], ['plan','Plan'], ['progress','Progress'], ['completed','Completed'], ['refusal','Refusal']];
  for (const [key, label] of items) {
    const div = document.createElement('div'); div.className = 'metric';
    const strong = document.createElement('strong'); strong.textContent = state.user ? counts[key] : '—';
    const span = document.createElement('span'); span.textContent = label;
    div.append(strong, span); metrics.append(div);
  }
}

function renderProjectTable() {
  const content = $('#content');
  const projects = filteredProjects();
  const showingOverdue = state.view === 'overdue';
  if (!state.user) {
    content.innerHTML = '<div class="empty-state"><div><h3>Sign in</h3><p>Sign in to load data</p></div></div>';
    return;
  }
  const wrap = document.createElement('div'); wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const thead = document.createElement('thead'); const hr = document.createElement('tr');
  projectColumns.forEach(([key, label]) => {
    const th = document.createElement('th');
    if (key === 'orderNumber') {
      th.setAttribute('aria-sort', state.numberSortDirection === 'asc' ? 'ascending' : 'descending');
      const sort = document.createElement('button');
      sort.type = 'button';
      sort.className = 'order-sort-button';
      sort.title = state.numberSortDirection === 'desc'
        ? 'Sort order number: oldest first' : 'Sort order number: newest first';
      sort.setAttribute('aria-label', sort.title);
      const text = document.createElement('span');
      text.textContent = label;
      const arrow = document.createElement('span');
      arrow.className = 'order-sort-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = state.numberSortDirection === 'desc' ? '↓' : '↑';
      sort.append(text, arrow);
      sort.addEventListener('click', () => {
        state.numberSortDirection = state.numberSortDirection === 'desc' ? 'asc' : 'desc';
        renderProjectTable();
      });
      th.append(sort);
    } else {
      th.textContent = label;
    }
    hr.append(th);
    if (showingOverdue && key === 'projectName') {
      for (const label of ['Update required', 'Overdue by']) {
        const extra = document.createElement('th'); extra.textContent = label; hr.append(extra);
      }
    }
  });
  thead.append(hr); table.append(thead);
  const tbody = document.createElement('tbody');
  for (const p of projects) {
    const tr = document.createElement('tr');
    tr.dataset.number = p.orderNumber;
    if (p.orderNumber === state.selectedNumber) tr.classList.add('selected');
    tr.addEventListener('click', () => selectProject(p.orderNumber));
    tr.addEventListener('dblclick', () => {
      // Some mobile browsers also synthesize dblclick after our explicit double tap.
      if (Date.now() - tableTouch.lastOpenAt < 750) return;
      openProjectEditor(p);
    });
    for (const [key] of projectColumns) {
      const td = document.createElement('td');
      if (key === 'status') {
        const span = document.createElement('span'); span.className = 'status-pill'; span.textContent = escapeText(p[key]); td.append(span);
      } else if (key === 'folderLink' && p.folderLink) {
        const a = document.createElement('a'); a.className = 'folder-link'; a.href = p.folderLink; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open folder'; a.addEventListener('click', e => e.stopPropagation()); td.append(a);
      } else {
        td.textContent = escapeText(p[key]);
        td.title = escapeText(p[key]);
      }
      tr.append(td);
      if (showingOverdue && key === 'projectName') {
        const overdue = overdueProjectInfo(p);
        const reason = document.createElement('td');
        reason.className = 'overdue-reason';
        reason.textContent = overdue?.reasons.join('; ') || '';
        reason.title = reason.textContent;
        const days = document.createElement('td');
        days.textContent = overdue ? `${overdue.days} d.` : '';
        tr.append(reason, days);
      }
    }
    tbody.append(tr);
  }
  table.append(tbody); wrap.append(table); content.replaceChildren(wrap);
  if (!projects.length) {
    const message = state.editableOnly
      ? '<div class="empty-state"><div><h3>No editable projects</h3><p>Turn off Editable only or change the current view.</p></div></div>'
      : '<div class="empty-state"><div><h3>No matching projects</h3><p>Change the view or search term.</p></div></div>';
    content.innerHTML = message;
  }
}

function renderCustomers() {
  const content = $('#content');
  if (!state.user) return renderProjectTable();
  const q = $('#searchInput').value.trim().toLowerCase();
  const rows = state.customers.filter(x => !q || Object.values(x).some(v => String(v ?? '').toLowerCase().includes(q)));
  const wrap = document.createElement('div'); wrap.className = 'table-wrap';
  const table = document.createElement('table'); table.style.minWidth = canEditCustomers() ? '1040px' : '900px';
  table.innerHTML = canEditCustomers()
    ? '<thead><tr><th>Customer</th><th>Representative</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead>'
    : '<thead><tr><th>Customer</th><th>Representative</th><th>Phone</th><th>Email</th></tr></thead>';
  const body = document.createElement('tbody');

  rows.forEach(c => {
    const tr = document.createElement('tr');
    [c.customer,c.representative,c.phone,c.email].forEach(v => {
      const td=document.createElement('td');
      td.textContent=escapeText(v);
      tr.append(td);
    });

    if (canEditCustomers()) {
      const actions = document.createElement('td');
      actions.className = 'user-actions';

      const edit = document.createElement('button');
      edit.className = 'btn';
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', e => {
        e.stopPropagation();
        openCustomers(c);
      });

      const del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', e => {
        e.stopPropagation();
        deleteCustomer(c);
      });

      actions.append(edit, del);
      tr.append(actions);
      tr.addEventListener('dblclick', () => openCustomers(c));
    }

    body.append(tr);
  });

  table.append(body);
  wrap.append(table);
  content.replaceChildren(wrap);
}

function shortProjectDiff(entry) {
  const before = entry.before || {}; const after = entry.after || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys.filter(k => JSON.stringify(before[k] ?? '') !== JSON.stringify(after[k] ?? ''));
  return changed.slice(0, 8).map(k => `${k}: ${escapeText(before[k])} → ${escapeText(after[k])}`).join('\n') || '—';
}

function renderAudit() {
  const content = $('#content');
  if (!state.user) return renderProjectTable();
  const q = $('#searchInput').value.trim().toLowerCase();
  const rows = state.audit.filter(x => !q || Object.values(x).some(v => String(v ?? '').toLowerCase().includes(q)));
  const wrap = document.createElement('div'); wrap.className = 'table-wrap';
  const table = document.createElement('table'); table.style.minWidth = '1200px';
  table.innerHTML = '<thead><tr><th>Date / time</th><th>User</th><th>Type</th><th>Order No.</th><th>Project</th><th>Customer</th><th>Changes</th></tr></thead>';
  const body = document.createElement('tbody');
  rows.forEach(a => {
    const tr=document.createElement('tr');
    const vals=[a.dateTime,a.user,a.changeType,a.orderNumber,a.projectName,a.customer];
    vals.forEach(v=>{const td=document.createElement('td');td.textContent=escapeText(v);tr.append(td);});
    const diff=document.createElement('td');diff.className='audit-change';diff.textContent=shortProjectDiff(a);tr.append(diff);body.append(tr);
  });
  table.append(body); wrap.append(table); content.replaceChildren(wrap);
}

function makeRoleChecklist(values = [], { includeAdmin = false, lockAdmin = false } = {}) {
  const selected = new Set(normalizeRoles(values));
  const wrap = document.createElement('div');
  wrap.className = 'role-checklist';

  const options = includeAdmin
    ? [['admin', 'Main administrator'], ...roleOptions]
    : roleOptions;

  for (const [role, label] of options) {
    const item = document.createElement('label');
    item.className = 'role-check-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = role;
    checkbox.checked = selected.has(role);
    if (role === 'admin' && lockAdmin) {
      checkbox.checked = true;
      checkbox.disabled = true;
    }
    const text = document.createElement('span');
    text.textContent = label;
    item.append(checkbox, text);
    wrap.append(item);
  }

  wrap.getRoles = () => {
    const roles = [...wrap.querySelectorAll('input[type="checkbox"]')]
      .filter(input => input.checked)
      .map(input => input.value);
    if (lockAdmin && !roles.includes('admin')) roles.unshift('admin');
    return roles;
  };

  return wrap;
}

function renderUsers() {
  const content = $('#content');
  if (!state.user?.canManageUsers) {
    content.innerHTML = '<div class="empty-state"><div><h3>Access denied</h3></div></div>';
    return;
  }

  const container = document.createElement('div');
  container.className = 'users-page';

  const addCard = document.createElement('form');
  addCard.className = 'user-add-card';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'User name';
  nameInput.required = true;

  const microsoftInput = document.createElement('input');
  microsoftInput.type = 'email';
  microsoftInput.placeholder = 'Microsoft account';
  microsoftInput.required = true;

  const roleControl = makeRoleChecklist(['pm']);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.type = 'submit';
  addBtn.textContent = 'Add user';

  addCard.append(nameInput, microsoftInput, roleControl, addBtn);
  addCard.addEventListener('submit', async e => {
    e.preventDefault();
    const roles = roleControl.getRoles();
    if (!roles.length) return showNotice('Select at least one role.', 'error');

    try {
      await request('/api/users', {
        method: 'POST',
        body: {
          username: nameInput.value,
          microsoftAccount: microsoftInput.value,
          roles
        }
      });
      await Promise.all([loadUsers(), refreshLookups()]);
      renderUsers();
      showNotice('User added.');
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });
  container.append(addCard);

  const q = $('#searchInput').value.trim().toLowerCase();
  const users = state.users.filter(u =>
    !q ||
    u.username.toLowerCase().includes(q) ||
    String(u.microsoftAccount || '').toLowerCase().includes(q) ||
    rolesLabel(u).toLowerCase().includes(q)
  );

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap users-table-wrap';

  const table = document.createElement('table');
  table.className = 'users-table';
  table.innerHTML = '<thead><tr><th>User</th><th>Microsoft account</th><th>Roles</th><th>Emergency PIN</th><th>Actions</th></tr></thead>';

  const body = document.createElement('tbody');

  for (const u of users) {
    const userRoles = normalizeRoles(u);
    const isMainAdmin = userRoles.includes('admin');
    const tr = document.createElement('tr');

    const userTd = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = u.username;
    userTd.append(strong);

    const accountTd = document.createElement('td');
    const account = document.createElement('input');
    account.type = 'email';
    account.className = 'password-reset';
    account.placeholder = 'name@helsinginhitsaus.fi';
    account.value = u.microsoftAccount || '';
    accountTd.append(account);

    if (u.microsoftLinked) {
      const linked = document.createElement('span');
      linked.className = 'account-linked';
      linked.textContent = 'Linked';
      accountTd.append(linked);
    }

    const accessTd = document.createElement('td');
    const accessControl = makeRoleChecklist(userRoles, {
      includeAdmin: isMainAdmin,
      lockAdmin: isMainAdmin
    });
    accessTd.append(accessControl);

    const passwordTd = document.createElement('td');
    let pass = null;
    if (isMainAdmin) {
      pass = document.createElement('input');
      pass.type = 'password';
      pass.className = 'password-reset';
      pass.placeholder = 'New emergency PIN';
      passwordTd.append(pass);
    } else {
      passwordTd.textContent = '—';
      passwordTd.className = 'muted';
    }

    const actionsTd = document.createElement('td');
    actionsTd.className = 'user-actions';

    const save = document.createElement('button');
    save.className = 'btn';
    save.type = 'button';
    save.textContent = 'Save';
    save.addEventListener('click', async () => {
      const roles = accessControl.getRoles();
      if (!roles.length) return showNotice('Select at least one role.', 'error');

      const payload = {
        microsoftAccount: account.value,
        roles
      };
      if (pass?.value) payload.password = pass.value;

      try {
        const result = await request(`/api/users/${encodeURIComponent(u.username)}`, {
          method: 'PUT',
          body: payload
        });

        if (pass) pass.value = '';
        if (u.username === state.user?.username && result.user) {
          state.user = { ...state.user, ...result.user };
          updateAuthUi();
        }

        await Promise.all([loadUsers(), refreshLookups()]);
        renderUsers();
        showNotice('User updated.');
      } catch (error) {
        showNotice(error.message, 'error');
      }
    });
    actionsTd.append(save);

    if (!isMainAdmin) {
      const del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm(`Delete user ${u.username}?`)) return;

        try {
          await request(`/api/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
          await Promise.all([loadUsers(), refreshLookups()]);
          renderUsers();
          showNotice('User deleted.');
        } catch (error) {
          showNotice(error.message, 'error');
        }
      });
      actionsTd.append(del);
    }

    tr.append(userTd, accountTd, accessTd, passwordTd, actionsTd);
    body.append(tr);
  }

  table.append(body);
  wrap.append(table);
  container.append(wrap);
  content.replaceChildren(container);
}

function setTableZoom(value) {
  const zoom = Math.max(70, Math.min(130, Math.round(Number(value) / 5) * 5));
  if (!Number.isFinite(zoom) || zoom === state.tableZoom) return;
  state.tableZoom = zoom;
  updateTableDisplay();
}

function updateTableDisplay() {
  const workspace = $('.workspace');
  if (!workspace) return;
  workspace.classList.toggle('is-fullscreen', state.tableFullscreen);
  document.body.classList.toggle('workspace-expanded', state.tableFullscreen);
  workspace.style.setProperty('--table-scale', String(state.tableZoom / 100));
  const zoomLevel = $('#zoomLevelBtn');
  if (zoomLevel) zoomLevel.textContent = `${state.tableZoom}%`;
  const zoomOut = $('#zoomOutBtn');
  if (zoomOut) zoomOut.disabled = state.tableZoom <= 70;
  const zoomIn = $('#zoomInBtn');
  if (zoomIn) zoomIn.disabled = state.tableZoom >= 130;
  const expand = $('#fullscreenTableBtn');
  if (expand) {
    expand.textContent = ''; // The supplied PNG icons are shown by CSS for both states.
    expand.title = state.tableFullscreen ? 'Exit table fullscreen' : 'Open table fullscreen';
    expand.setAttribute('aria-label', expand.title);
    expand.setAttribute('aria-pressed', String(state.tableFullscreen));
  }
}

function renderToolbar() {
  const projectView = ['all','plan','progress','completed','refusal','overdue'].includes(state.view);
  const canEdit = canEditProjects();
  $('#addProjectBtn').classList.toggle('hidden', !projectView || !canEdit);
  $('#editProjectBtn').classList.toggle('hidden', !projectView || !canEdit);
  $('#openFolderBtn').classList.toggle('hidden', !projectView);
  const operationalAdmin = canOperateAdminTools();
  $('#syncFolderBtn').classList.toggle('hidden', !projectView || !operationalAdmin);
  $('#mailStubBtn').classList.toggle('hidden', !projectView || !operationalAdmin);
  $('#editableOnlyControl').classList.toggle('hidden', !projectView || !canEdit);
  $('#editableOnlyToggle').checked = Boolean(state.editableOnly);
  $('#manageCustomersBtn').classList.toggle('hidden', state.view !== 'customers' || !canEditCustomers());
  const p = selectedProject();
  $('#editProjectBtn').disabled = !p || !p.canEdit;
  $('#openFolderBtn').disabled = !p || !localProjectFolderPath(p);
  $('#syncFolderBtn').disabled = !operationalAdmin || !p;
  $('#mailStubBtn').disabled = !operationalAdmin || !p;
}

function render() {
  const [title, subtitle] = viewInfo[state.view] || viewInfo.all;
  setText($('#viewTitle'), title);
  setText($('#viewSubtitle'), subtitle);
  $('#viewSubtitle').classList.toggle('hidden', !subtitle);
  renderMetrics();
  const overdueCount = $('#updatesRequiredCount');
  if (overdueCount) overdueCount.textContent = state.user
    ? String(state.projects.filter(p => overdueProjectInfo(p)).length)
    : '0';
  updateAuthUi();
  updateTableDisplay();
  renderToolbar();
  if (state.view === 'customers') renderCustomers();
  else if (state.view === 'audit') renderAudit();
  else if (state.view === 'users') renderUsers();
  else renderProjectTable();
}

function selectedProject() { return state.projects.find(p => p.orderNumber === state.selectedNumber) || null; }

function selectProject(number) {
  state.selectedNumber = number;
  $$('#content tbody tr[data-number]').forEach(row => row.classList.toggle('selected', row.dataset.number === number));
  renderToolbar();
}

function option(select, value, label = value) {
  const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o);
}

function fillSelect(select, values, blank = true) {
  const previous = select.value; select.replaceChildren(); if (blank) option(select, '', '—');
  [...new Set((values || []).filter(Boolean))].forEach(v => option(select, v));
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
}

function customerNames() { return [...new Set(state.customers.map(x => x.customer).filter(Boolean))].sort((a,b)=>a.localeCompare(b)); }
function repsFor(customer) { return state.customers.filter(x => x.customer === customer); }

function refreshRepresentativeOptions(preferred = '') {
  const form = $('#projectForm'); const customer = form.elements.customer.value;
  const reps = repsFor(customer); const select = form.elements.customerRepresentative;
  fillSelect(select, reps.map(x => x.representative));
  if (preferred && [...select.options].some(o => o.value === preferred)) select.value = preferred;
  applyRepresentativeContact();
}

function applyRepresentativeContact() {
  const f = $('#projectForm').elements;
  const item = state.customers.find(x => x.customer === f.customer.value && x.representative === f.customerRepresentative.value);
  if (item) { f.customerPhone.value = item.phone || ''; f.customerEmail.value = item.email || ''; }
}

function duration(start, end) {
  if (!start || !end) return '';
  const a = new Date(`${start}T00:00:00Z`); const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(+a) || Number.isNaN(+b) || b < a) return '';
  return `${Math.floor((b-a)/86400000)+1} d.`;
}

function updateDurations() {
  const f = $('#projectForm').elements;
  f.durationPlan.value = duration(f.startPlan.value, f.endPlan.value);
  f.durationFact.value = duration(f.startFact.value, f.endFact.value);
}

function requiredProjectFields(status) {
  const names = new Set(['projectName', 'status']);
  if (status !== 'Rejected') {
    ['customer','activityType','customerRepresentative','startPlan','endPlan'].forEach(n => names.add(n));
  }
  if (['Confirmed','In Progress','Completed'].includes(status)) {
    ['projectManager','costExpected','currency','contract'].forEach(n => names.add(n));
  }
  if (['In Progress','Completed'].includes(status)) {
    ['workLocation','startFact'].forEach(n => names.add(n));
  }
  if (status === 'Completed') ['endFact','costActual'].forEach(n => names.add(n));
  return names;
}

function updateProjectRequiredFields() {
  const form = $('#projectForm');
  $('#projectValidation').classList.add('hidden');
  form.querySelectorAll('.field-invalid').forEach(label => label.classList.remove('field-invalid'));
  form.querySelectorAll('[aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid'));
  const readOnly = form.dataset.readOnly === 'true';
  const required = requiredProjectFields(form.elements.status.value);
  for (const label of form.querySelectorAll('label.field')) {
    const field = label.querySelector('input[name],select[name]');
    const text = label.querySelector('span');
    if (!field || !text) continue;
    if (!text.dataset.baseLabel) text.dataset.baseLabel = text.textContent.replace(/\s*\*$/, '');
    text.textContent = text.dataset.baseLabel + (required.has(field.name) ? ' *' : '');
    field.required = !readOnly && required.has(field.name);
  }
  const needsContact = form.elements.status.value !== 'Rejected';
  const contactHint = needsContact ? ' Enter at least one contact: phone or email.' : '';
  $('#projectRequiredHelp').textContent = 'Fields marked * are required.' + contactHint;
}

function validateProjectForm() {
  const form = $('#projectForm');
  const fields = form.elements;
  const required = requiredProjectFields(fields.status.value);
  form.querySelectorAll('.field-invalid').forEach(label => label.classList.remove('field-invalid'));
  form.querySelectorAll('[aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid'));
  const errors = [];
  let firstInvalid = null;
  const mark = name => {
    const field = fields[name];
    if (!field) return;
    field.setAttribute('aria-invalid', 'true');
    field.closest('.field')?.classList.add('field-invalid');
    firstInvalid ||= field;
  };
  for (const name of required) {
    if (!String(fields[name]?.value ?? '').trim()) {
      mark(name);
      errors.push(`${fields[name]?.closest('.field')?.querySelector('span')?.dataset.baseLabel || name} is required`);
    }
  }
  if (fields.status.value !== 'Rejected' && !fields.customerPhone.value.trim() && !fields.customerEmail.value.trim()) {
    mark('customerPhone');
    mark('customerEmail');
    errors.push('Enter a customer phone number or email address');
  }
  if (fields.customerEmail.value && !fields.customerEmail.validity.valid) {
    mark('customerEmail'); errors.push('Customer email address is invalid');
  }
  if (fields.startPlan.value && fields.endPlan.value && fields.endPlan.value < fields.startPlan.value) {
    mark('endPlan'); errors.push('Planned end cannot be before planned start');
  }
  if (fields.startFact.value && fields.endFact.value && fields.endFact.value < fields.startFact.value) {
    mark('endFact'); errors.push('Actual end cannot be before actual start');
  }
  if (errors.length) {
    $('#projectValidation').textContent = errors.join('; ');
    $('#projectValidation').classList.remove('hidden');
    firstInvalid?.focus();
  }
  return !errors.length;
}

function populateProjectSelects() {
  const f = $('#projectForm').elements;
  fillSelect(f.status, state.lookups.statuses || ['In plan','Offer Preparation','Awaiting Client Decision','Confirmed','In Progress','Completed','Rejected']);
  fillSelect(f.activityType, state.lookups.activityTypes || []);
  fillSelect(f.customer, customerNames());
  fillSelect(f.projectManager, state.lookups.projectManagers || []);
  fillSelect(f.currency, state.lookups.currencies || []);
}

function setFormProject(project = {}) {
  const form = $('#projectForm');
  populateProjectSelects();
  for (const el of form.elements) {
    if (!el.name || el.name === 'customerRepresentative') continue;
    if (el.name in project) el.value = project[el.name] ?? '';
    else if (!state.editingNumber) el.value = '';
  }
  refreshRepresentativeOptions(project.customerRepresentative || '');
  if (project.customerRepresentative) form.elements.customerRepresentative.value = project.customerRepresentative;
  if (project.customerPhone != null) form.elements.customerPhone.value = project.customerPhone;
  if (project.customerEmail != null) form.elements.customerEmail.value = project.customerEmail;
  if (state.user?.access === 'edit_own') {
    form.elements.projectManager.value = project.projectManager || state.user.username;
    form.elements.projectManager.disabled = true;
  } else form.elements.projectManager.disabled = false;

  const hasLocalFolder = Boolean(localProjectFolderPath(project));
  const hasWebFolder = Boolean(projectWebFolderUrl(project));
  $('#openProjectFolderBtn').disabled = !hasLocalFolder;
  $('#openProjectFolderWebBtn').disabled = !hasWebFolder;

  updateDurations();
}

function setProjectDialogMode({ project = null, readOnly = false } = {}) {
  const form = $('#projectForm');
  form.dataset.readOnly = readOnly ? 'true' : 'false';

  for (const el of form.querySelectorAll('input, select')) {
    el.disabled = readOnly;
  }

  if (!readOnly && state.user?.access === 'edit_own') {
    form.elements.projectManager.disabled = true;
  }

  $('#saveProjectBtn').classList.toggle('hidden', readOnly);
  $('#deleteProjectBtn').classList.toggle('hidden', readOnly || !project);

  const closeBtn = $('#projectDialog .modal-actions .action-row [data-close-dialog]');
  if (closeBtn) closeBtn.textContent = readOnly ? 'Close' : 'Cancel';
}

function openProjectEditor(project = null) {
  if (!state.user) return $('#authDialog').showModal();

  if (!project && !canEditProjects()) {
    return showNotice('Your access level is read-only.', 'error');
  }

  const readOnly = Boolean(project && !project.canEdit);
  state.editingNumber = project?.orderNumber || null;

  setText(
    $('#projectModeLabel'),
    project
      ? `PROJECT ${project.orderNumber}${readOnly ? ' · READ ONLY' : ''}`
      : 'NEW PROJECT'
  );
  setText(
    $('#projectDialogTitle'),
    project ? (readOnly ? 'Project details' : 'Edit project') : 'Add project'
  );

  $('#projectValidation').classList.add('hidden');
  setFormProject(project || {
    status: 'In plan',
    projectManager: state.user?.access === 'edit_own' ? state.user.username : ''
  });
  setProjectDialogMode({ project, readOnly });
  updateProjectRequiredFields();
  $('#projectDialog').showModal();
}

function formPayload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const pm = form.elements.projectManager;
  if (pm.disabled) data.projectManager = pm.value;
  return data;
}

async function saveProject() {
  if ($('#projectForm').dataset.readOnly === 'true') return;
  if (state.operationBusy) return;
  const validation = $('#projectValidation');
  validation.classList.add('hidden');
  if (!validateProjectForm()) return;
  const payload = formPayload($('#projectForm'));
  const editing = Boolean(state.editingNumber);
  const idempotencyKey = operationKey();

  if (!beginBusy(
    editing ? 'Updating project…' : 'Creating project…',
    'Saving project data and synchronizing the OneDrive folder. This can take a little time.'
  )) return;

  try {
    let r;
    const headers = { 'X-Idempotency-Key': idempotencyKey };
    if (editing) {
      r = await request(`/api/projects/${encodeURIComponent(state.editingNumber)}`, {
        method: 'PUT',
        headers,
        body: payload
      });
    } else {
      r = await request('/api/projects', {
        method: 'POST',
        headers,
        body: payload
      });
    }

    $('#projectDialog').close();
    state.selectedNumber = r.project.orderNumber;
    await loadCoreData();
    showNotice(editing ? 'Project updated.' : `Project ${r.project.orderNumber} created.`);
  } catch (error) {
    validation.textContent = error.message;
    validation.classList.remove('hidden');
  } finally {
    endBusy();
  }
}

async function deleteProject() {
  if (state.operationBusy) return;
  const p = selectedProject() || state.projects.find(x => x.orderNumber === state.editingNumber);
  if (!p) return;

  try {
    const r = await request('/api/projects/delete-challenge', {
      method: 'POST',
      body: { orderNumber: p.orderNumber }
    });

    pendingDeleteChallenge = {
      orderNumber: p.orderNumber,
      projectName: p.projectName,
      challengeId: r.challenge.id,
      idempotencyKey: operationKey()
    };

    setText($('#deleteProjectName'), `${p.orderNumber} — ${p.projectName}`);
    setText($('#deleteProjectCode'), r.challenge.code);

    const input = $('#deleteCodeInput');
    input.value = '';
    const validation = $('#deleteValidation');
    validation.textContent = '';
    validation.classList.add('hidden');

    $('#deleteConfirmDialog').showModal();
    setTimeout(() => input.focus(), 0);
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

async function confirmDeleteProject(event) {
  event.preventDefault();
  if (state.operationBusy || !pendingDeleteChallenge) return;

  const input = $('#deleteCodeInput');
  const confirmationCode = String(input.value || '').trim().toUpperCase();
  const validation = $('#deleteValidation');

  if (!/^[A-Z0-9]{5}$/.test(confirmationCode)) {
    validation.textContent = 'Enter the 5-character code shown above.';
    validation.classList.remove('hidden');
    input.focus();
    return;
  }

  validation.textContent = '';
  validation.classList.add('hidden');
  $('#confirmDeleteBtn').disabled = true;

  if (!beginBusy(
    'Deleting project…',
    'Removing the project folder from OneDrive and then deleting the project from the register.'
  )) {
    $('#confirmDeleteBtn').disabled = false;
    return;
  }

  try {
    await request(`/api/projects/${encodeURIComponent(pendingDeleteChallenge.orderNumber)}`, {
      method: 'DELETE',
      headers: { 'X-Idempotency-Key': pendingDeleteChallenge.idempotencyKey },
      body: {
        challengeId: pendingDeleteChallenge.challengeId,
        confirmationCode
      }
    });

    $('#deleteConfirmDialog').close();
    $('#projectDialog').close();
    pendingDeleteChallenge = null;
    state.selectedNumber = null;
    await loadCoreData();
    showNotice('Project and its OneDrive folder were deleted.');
  } catch (error) {
    validation.textContent = error.message;
    validation.classList.remove('hidden');
    input.select();
  } finally {
    $('#confirmDeleteBtn').disabled = false;
    endBusy();
  }
}

function openCustomers(editItem = null) {
  if (!state.user) return $('#authDialog').showModal();
  if (!canEditCustomers()) return showNotice('You do not have permission to edit customers.', 'error');
  renderCustomerDialogRows();
  const f = $('#customerForm'); f.reset(); f.elements.id.value = '';
  if (editItem) Object.entries(editItem).forEach(([k,v]) => { if (f.elements[k]) f.elements[k].value = v ?? ''; });
  $('#customerDialog').showModal();
}

function renderCustomerDialogRows() {
  const body = $('#customersBody'); body.replaceChildren();
  state.customers.slice().sort((a,b)=>`${a.customer}${a.representative}`.localeCompare(`${b.customer}${b.representative}`)).forEach(c => {
    const tr=document.createElement('tr');
    [c.customer,c.representative,c.phone,c.email].forEach(v=>{const td=document.createElement('td');td.textContent=escapeText(v);tr.append(td);});
    const actions=document.createElement('td');
    const edit=document.createElement('button'); edit.className='btn';edit.textContent='Edit'; edit.type='button'; edit.onclick=()=>openCustomers(c);
    const del=document.createElement('button');del.className='btn btn-danger';del.textContent='Delete';del.type='button';del.style.marginLeft='6px';del.onclick=()=>deleteCustomer(c);
    actions.append(edit,del);tr.append(actions);body.append(tr);
  });
}

async function saveCustomer() {
  const f=$('#customerForm'); const data=Object.fromEntries(new FormData(f).entries()); const id=data.id; delete data.id;
  try {
    if (id) await request(`/api/customers/${encodeURIComponent(id)}`, { method:'PUT', body:data });
    else await request('/api/customers', { method:'POST', body:data });
    const result=await request('/api/customers'); state.customers=result.customers||[]; f.reset(); f.elements.id.value=''; renderCustomerDialogRows(); render(); showNotice('Customer directory updated.');
  } catch(error){ showNotice(error.message,'error'); }
}

async function deleteCustomer(c) {
  if (!confirm(`Delete ${c.customer} / ${c.representative}?`)) return;
  try {
    await request(`/api/customers/${encodeURIComponent(c.id)}`, {method:'DELETE'});
    const r=await request('/api/customers');state.customers=r.customers||[];renderCustomerDialogRows();render();
  } catch(error){showNotice(error.message,'error');}
}

async function requestProjectUpdate() {
  const p = selectedProject();
  if (!p || !canOperateAdminTools() || state.operationBusy) return;
  if (!confirm(`Send project update request for ${p.orderNumber} – ${p.projectName}?\n\nFrom: system@helsinginhitsaus.fi\nTo (testing): andrey@helsinginhitsaus.fi`)) return;
  if (!beginBusy('Sending update request…', 'Submitting the request through Microsoft 365.')) return;
  try {
    const result = await request('/api/mail/project-update-request', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': operationKey() },
      body: { orderNumber: p.orderNumber }
    });
    if (result.accepted) showNotice(result.message || 'Microsoft 365 accepted the email.');
    else showNotice('Mail server did not confirm acceptance.', 'error');
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    endBusy();
  }
}

async function syncFolder() {
  if (!canOperateAdminTools() || state.operationBusy) return;
  const p = selectedProject();
  if (!p) return;
  if (!beginBusy('Synchronizing folder…', 'Checking the project folder in OneDrive.')) return;
  try {
    const r = await request('/api/folders/sync', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': operationKey() },
      body: { orderNumber: p.orderNumber }
    });
    state.selectedNumber = r.project?.orderNumber || p.orderNumber;
    await loadCoreData();
    showNotice('Project folder synchronized.');
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    endBusy();
  }
}

function base64UrlUtf8(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function projectForOpenFolder() {
  return selectedProject() || state.projects.find(x => x.orderNumber === state.editingNumber) || null;
}

function localProjectFolderPath(project) {
  const direct = String(project?.folderPath || '').trim().replace(/\\/g, '/');
  if (direct) return direct;

  const legacy = String(project?.folderLink || '').trim();
  if (!/^file:/i.test(legacy)) return '';

  let decoded = legacy;
  try { decoded = decodeURIComponent(legacy); } catch {}
  decoded = decoded.replace(/^file:\/+/i, '').replace(/\\/g, '/');

  const marker = 'Helsingin Hitsaus/7. Projects';
  const index = decoded.lastIndexOf(marker);
  return index >= 0 ? decoded.slice(index) : '';
}

const ONEDRIVE_WEB_HOME = 'https://helsinginhitsaus-my.sharepoint.com/my';
const ONEDRIVE_PERSONAL_DOCUMENTS = '/personal/andrey_helsinginhitsaus_fi/Documents';
const ONEDRIVE_VIEW_ID = 'af5a1adf-7528-4d65-88d6-5fac1ea8ba82';

function processOpenerInstallMarker() {
  const url = new URL(window.location.href);
  const status = url.searchParams.get('opener');

  if (status === 'installed') {
    localStorage.setItem(OPENER_INSTALL_KEY, '1');
    url.searchParams.delete('opener');
    const clean = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, clean);
    return 'installed';
  }

  if (status === 'removed') {
    localStorage.removeItem(OPENER_INSTALL_KEY);
    url.searchParams.delete('opener');
    const clean = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, clean);
    return 'removed';
  }

  return '';
}

function openerKnownInstalled() {
  return localStorage.getItem(OPENER_INSTALL_KEY) === '1';
}

function projectWebFolderUrl(project) {
  const stored = String(project?.folderLink || '').trim();
  if (/^https?:\/\//i.test(stored)) return stored;

  const relative = localProjectFolderPath(project);
  if (!relative || !relative.startsWith('Helsingin Hitsaus/7. Projects')) return '';

  const url = new URL(ONEDRIVE_WEB_HOME);
  url.searchParams.set('id', `${ONEDRIVE_PERSONAL_DOCUMENTS}/${relative}`);
  url.searchParams.set('viewid', ONEDRIVE_VIEW_ID);
  return url.toString();
}

function showOpenerHelp(project) {
  openerFallbackProject = project || null;
  const fallback = $('#openerWebFallbackBtn');
  fallback.classList.toggle('hidden', !projectWebFolderUrl(project));
  $('#openerHelpDialog').showModal();
}

function setOpenerLaunchBusy(busy) {
  openerLaunchBusy = busy;

  const toolbarButton = $('#openFolderBtn');
  const cardButton = $('#openProjectFolderBtn');

  if (busy) {
    if (toolbarButton) toolbarButton.disabled = true;
    if (cardButton) cardButton.disabled = true;
    return;
  }

  const toolbarProject = selectedProject();
  if (toolbarButton) {
    toolbarButton.disabled = !toolbarProject || !localProjectFolderPath(toolbarProject);
  }

  const cardProject = projectForOpenFolder();
  if (cardButton) {
    cardButton.disabled = !cardProject || !localProjectFolderPath(cardProject);
  }
}

function openFolder(project = projectForOpenFolder()) {
  if (openerLaunchBusy) return;

  const folderPath = localProjectFolderPath(project);
  if (!folderPath) {
    return showNotice('Synchronize the project folder first.', 'error');
  }

  if (!openerKnownInstalled()) {
    showOpenerHelp(project);
    return;
  }

  setOpenerLaunchBusy(true);

  const attempt = ++openerAttemptSequence;
  let externalLaunchDetected = false;

  const cleanupDetection = () => {
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
  const markExternalLaunch = () => {
    externalLaunchDetected = true;
    cleanupDetection();
    if (attempt === openerAttemptSequence) setOpenerLaunchBusy(false);
  };
  const onBlur = () => markExternalLaunch();
  const onVisibilityChange = () => {
    if (document.hidden) markExternalLaunch();
  };

  window.addEventListener('blur', onBlur, { once: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  const openerUrl = `projectregister://open/${base64UrlUtf8(folderPath)}`;
  const link = document.createElement('a');
  link.href = openerUrl;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  setTimeout(() => link.remove(), 1000);

  setTimeout(() => {
    cleanupDetection();
    if (attempt !== openerAttemptSequence) return;

    setOpenerLaunchBusy(false);

    if (
      !externalLaunchDetected &&
      document.visibilityState === 'visible' &&
      document.hasFocus()
    ) {
      showOpenerHelp(project);
    }
  }, 3000);

  showNotice('Opening the local OneDrive folder…');
}

function openFolderWeb(project = projectForOpenFolder()) {
  const link = projectWebFolderUrl(project);
  if (link) {
    window.open(link, '_blank', 'noopener');
  } else {
    showNotice('The OneDrive web path is not available for this project.', 'error');
  }
}

async function activateView(view) {
  if (view === 'users' && !state.user?.canManageUsers) return;
  state.view=view; state.selectedNumber=null;
  $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));
  $('#searchInput').value='';
  try {
    if(view==='audit'&&state.user) await loadAudit();
    if(view==='users'&&state.user?.canManageUsers) await loadUsers();
    render();
  } catch(e) { showNotice(e.message,'error'); }
}

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>activateView(btn.dataset.view)));
$('#zoomOutBtn')?.addEventListener('click', () => setTableZoom(state.tableZoom - 10));
$('#zoomInBtn')?.addEventListener('click', () => setTableZoom(state.tableZoom + 10));
$('#zoomLevelBtn')?.addEventListener('click', () => setTableZoom(100));
$('#fullscreenTableBtn')?.addEventListener('click', () => { state.tableFullscreen = !state.tableFullscreen; updateTableDisplay(); });

// Desktop: Ctrl + mouse wheel changes table zoom, without scaling the page.
$('.workspace')?.addEventListener('wheel', event => {
  if (!event.ctrlKey || !state.user || !['all','plan','progress','completed','refusal','overdue'].includes(state.view)) return;
  if (!event.deltaY) return;
  event.preventDefault();
  setTableZoom(state.tableZoom + (event.deltaY < 0 ? 10 : -10));
}, { passive: false });

// Touch devices: one finger scrolls; double-tap opens the project; two fingers zoom the table.
const tableTouch = {
  startDistance: 0, startZoom: 100, active: false,
  tapStart: null, lastTap: null, ignoreTapUntil: 0, lastOpenAt: 0
};
const PROJECT_DOUBLE_TAP_MS = 400;
function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}
$('#content')?.addEventListener('touchstart', event => {
  if (!state.user) return;
  if (event.touches.length > 1) {
    // Never interpret pinch-to-zoom as two taps.
    tableTouch.tapStart = null;
    tableTouch.lastTap = null;
    tableTouch.ignoreTapUntil = Date.now() + 500;
    if (event.touches.length === 2 && event.target.closest('.table-wrap')) {
      tableTouch.startDistance = touchDistance(event.touches);
      tableTouch.startZoom = state.tableZoom;
      tableTouch.active = tableTouch.startDistance > 0;
    }
    return;
  }
  if (event.touches.length !== 1 || Date.now() < tableTouch.ignoreTapUntil) return;
  const row = event.target.closest('tr[data-number]');
  if (!row || event.target.closest('a, button, input, select, textarea')) {
    tableTouch.tapStart = null;
    return;
  }
  tableTouch.tapStart = {
    number: row.dataset.number,
    identifier: event.touches[0].identifier,
    x: event.touches[0].clientX,
    y: event.touches[0].clientY,
    startedAt: Date.now()
  };
}, { passive: true });
$('#content')?.addEventListener('touchmove', event => {
  if (event.touches.length > 1) {
    tableTouch.tapStart = null;
    tableTouch.lastTap = null;
  } else if (tableTouch.tapStart && event.touches.length === 1) {
    const finger = event.touches[0];
    if (Math.hypot(finger.clientX - tableTouch.tapStart.x, finger.clientY - tableTouch.tapStart.y) > 12) {
      // Horizontal and vertical swipes must not trigger opening.
      tableTouch.tapStart = null;
      tableTouch.lastTap = null;
    }
  }
  if (!tableTouch.active || event.touches.length !== 2 || !event.cancelable) return;
  event.preventDefault();
  setTableZoom(tableTouch.startZoom * touchDistance(event.touches) / tableTouch.startDistance);
}, { passive: false });
$('#content')?.addEventListener('touchend', event => {
  if (event.touches.length < 2) tableTouch.active = false;
  const start = tableTouch.tapStart;
  tableTouch.tapStart = null;
  if (!start || event.touches.length || event.changedTouches.length !== 1 ||
      Date.now() < tableTouch.ignoreTapUntil) return;
  const finger = event.changedTouches[0];
  if (finger.identifier !== start.identifier || Date.now() - start.startedAt > 500 ||
      Math.hypot(finger.clientX - start.x, finger.clientY - start.y) > 12) {
    tableTouch.lastTap = null;
    return;
  }
  const tap = { number: start.number, x: finger.clientX, y: finger.clientY, at: Date.now() };
  const last = tableTouch.lastTap;
  if (last && last.number === tap.number &&
      tap.at - last.at <= PROJECT_DOUBLE_TAP_MS &&
      Math.hypot(tap.x - last.x, tap.y - last.y) <= 35) {
    tableTouch.lastTap = null;
    // Prevent a synthetic click/dblclick from opening the same dialog twice.
    if (event.cancelable) event.preventDefault();
    if (!document.querySelector('dialog[open]')) {
      const project = state.projects.find(p => String(p.orderNumber) === tap.number);
      if (project) {
        tableTouch.lastOpenAt = Date.now();
        openProjectEditor(project);
      }
    }
  } else {
    tableTouch.lastTap = tap;
  }
}, { passive: false });
$('#content')?.addEventListener('touchcancel', () => {
  tableTouch.active = false;
  tableTouch.tapStart = null;
  tableTouch.lastTap = null;
}, { passive: true });

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.tableFullscreen && !document.querySelector('dialog[open]')) {
    state.tableFullscreen = false;
    updateTableDisplay();
  }
});
let lastOverdueDay = todayLocalIso();
window.addEventListener('focus', () => {
  if (todayLocalIso() !== lastOverdueDay) { lastOverdueDay = todayLocalIso(); render(); }
  void refreshCoreDataIfChanged();
  void refreshPresence();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void refreshCoreDataIfChanged();
    void refreshPresence();
  }
});
window.setInterval(() => {
  if (todayLocalIso() !== lastOverdueDay) { lastOverdueDay = todayLocalIso(); render(); }
  void refreshCoreDataIfChanged();
}, 120000);
window.setInterval(() => { void refreshPresence(); }, 8000);
$('#searchInput').addEventListener('input',render);
$('#editableOnlyToggle').addEventListener('change', e => {
  state.editableOnly = Boolean(e.target.checked);
  state.selectedNumber = null;
  render();
});
$('#addProjectBtn').addEventListener('click',()=>openProjectEditor());
$('#editProjectBtn').addEventListener('click',()=>{const p=selectedProject();if(p)openProjectEditor(p);});
$('#openFolderBtn').addEventListener('click', () => openFolder(selectedProject()));
$('#openProjectFolderBtn').addEventListener('click', () => openFolder(projectForOpenFolder()));
$('#openProjectFolderWebBtn').addEventListener('click', () => openFolderWeb(projectForOpenFolder()));
$('#openerConfirmInstalledBtn').addEventListener('click', () => {
  localStorage.setItem(OPENER_INSTALL_KEY, '1');
  $('#openerHelpDialog').close();
  showNotice('Folder opener enabled for this browser. Use Open folder again.');
});
$('#openerWebFallbackBtn').addEventListener('click', () => {
  const project = openerFallbackProject;
  $('#openerHelpDialog').close();
  openFolderWeb(project);
});
$('#openerHelpDialog').addEventListener('close', () => {
  openerFallbackProject = null;
});
$('#syncFolderBtn').addEventListener('click',syncFolder);
$('#mailStubBtn').addEventListener('click',requestProjectUpdate);
$('#manageCustomersBtn').addEventListener('click',()=>openCustomers());
$('#authBtn').addEventListener('click',()=>$('#authDialog').showModal());
$('#microsoftLoginBtn').addEventListener('click', startMicrosoftSignIn);
$('#landingMicrosoftLoginBtn').addEventListener('click', startMicrosoftSignIn);
$('#landingEmergencyForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (state.user || state.operationBusy) return;

  const password = $('#landingPinInput').value;
  if (!password) return;

  setLandingReady(false);
  setLandingStatus('Signing in…');

  try {
    const r = await loginRequest(password);
    state.user = r.user;
    $('#landingPinInput').value = '';
    setText($('#busyTitle'), 'Loading projects…');
    setText($('#busyText'), 'Preparing the project register.');
    await loadCoreData();
    setLandingStatus('');
  } catch (error) {
    setLandingStatus(error.message, true);
  } finally {
    setLandingReady(true);
  }
});
$$('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog')?.close()));

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (state.user || state.operationBusy) return;

  const password = $('#pinInput').value;
  if (!password) return;

  if (!beginBusy('Signing in…', 'Checking your access and loading project data.')) return;
  $('#loginBtn').disabled = true;

  try {
    const r = await loginRequest(password);
    state.user = r.user;
    $('#pinInput').value = '';
    $('#authDialog').close();
    setText($('#busyTitle'), 'Loading projects…');
    setText($('#busyText'), 'Preparing the project register.');
    await loadCoreData();
    showNotice(`Signed in as ${state.user.username}.`);
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    $('#loginBtn').disabled = false;
    endBusy();
  }
});
$('#logoutBtn').addEventListener('click',async()=>{
  try{await request('/api/auth/logout',{method:'POST'});}catch{}
  $('#authDialog').close();clearSession({ backendReady: true });showNotice('Signed out.');
});
$('#projectForm').addEventListener('submit',e=>{e.preventDefault();saveProject();});
$('#deleteProjectBtn').addEventListener('click',deleteProject);
$('#deleteConfirmForm').addEventListener('submit', confirmDeleteProject);
$('#deleteCodeInput').addEventListener('input', e => {
  e.target.value = String(e.target.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
});
$('#deleteConfirmDialog').addEventListener('close', () => {
  pendingDeleteChallenge = null;
  $('#deleteCodeInput').value = '';
  $('#deleteValidation').classList.add('hidden');
});
$('#projectForm').elements.status.addEventListener('change',updateProjectRequiredFields);
$('#projectForm').elements.customer.addEventListener('change',()=>refreshRepresentativeOptions());
$('#projectForm').addEventListener('input', event => {
  const field = event.target;
  if (field.matches('input, select')) {
    field.removeAttribute('aria-invalid');
    field.closest('.field')?.classList.remove('field-invalid');
  }
});
$('#projectForm').elements.customerRepresentative.addEventListener('change',applyRepresentativeContact);
['startPlan','endPlan','startFact','endFact'].forEach(n=>$('#projectForm').elements[n].addEventListener('change',updateDurations));
$('#customerForm').addEventListener('submit',e=>{e.preventDefault();saveCustomer();});
$('#resetCustomerBtn').addEventListener('click',()=>{$('#customerForm').reset();$('#customerForm').elements.id.value='';});
$('#closeCustomerDialog').addEventListener('click',()=>$('#customerDialog').close());

const openerInstallStatus = processOpenerInstallMarker();

updateAuthUi();
render();

if (openerInstallStatus === 'installed') {
  setLandingStatus('Folder opener installed. You can sign in and use Open folder.');
}

const microsoftRedirectHandled = await completeMicrosoftSignIn();
if (!microsoftRedirectHandled) await ensureBackendReady();
updateAuthUi();
render();
