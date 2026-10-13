import { t, getLanguage, setLanguage, initStaticTranslations, localizeGeneratedUi, fieldText, translateHistoryValue } from './locale.js?v=20261013-i18n-v1';

// Module links use this tab, never window.open. Each backend keeps its own
// authorization decisions; Microsoft provides SSO only, not shared privileges.
const PROJECT_REGISTRY_URL='https://project-register.helsinginhitsaus.fi/';
const WAREHOUSE_REGISTRY_URL='https://hh-warehouse.onrender.com/';
const incomingModule=new URL(location.href).searchParams.get('from_module')==='warehouse';
if(incomingModule)sessionStorage.setItem('hhProjectIncomingModule','warehouse');
const moduleSsoPending=new URL(location.href).searchParams.get('auto_sso')==='1';
const moduleOrigin=()=>sessionStorage.getItem('hhProjectIncomingModule')==='warehouse';
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
  systemMessages: [],
  systemUnreadCount: 0,
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
  audit: ['Change History', 'Who changed each project field, and what changed.'],
  users: ['Users & Access', 'Manage users, passwords and access rights.'],
  system: ['System messages', 'System warnings, delivery failures and operational notifications.']
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
  url.searchParams.delete('auto_sso');
  url.searchParams.delete('from_module');
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
    document.documentElement.removeAttribute('data-module-sso');
    if(moduleOrigin()&&/not authorized|access denied|no access|not permitted/i.test(authError)){
      showProjectModuleDenied();
    }else{
      setLandingStatus(authError,true);
      // A silent sign-in can legitimately require user interaction.
      // Keep the normal Microsoft button available as a fallback.
    }
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
    if(moduleOrigin())sessionStorage.removeItem('hhProjectIncomingModule');
    showNotice(`Signed in as ${state.user.username}.`);
  } catch (error) {
    document.documentElement.removeAttribute('data-module-sso');
    clearSession();
    if(moduleOrigin()&&/not authorized|denied|forbidden/i.test(error.message))showProjectModuleDenied();
    else showNotice(error.message, 'error');
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
    setText(label, t('Opening Microsoft sign-in…'));
  } else if (state.backendWakeFailed) {
    setText(label, t('Try sign in again'));
  } else if (!state.backendReady && state.microsoftSignInQueued) {
    setText(label, t('Starting secure server…'));
  } else if (!state.backendReady) {
    setText(label, t('Preparing sign in…'));
  } else {
    setText(label, t('Sign in with Microsoft'));
  }
}

function performMicrosoftRedirect() {
  if (state.microsoftRedirecting) return;
  state.microsoftSignInQueued = false;
  state.microsoftRedirecting = true;
  state.backendWakeFailed = false;
  updateLandingMicrosoftButton();
  setLandingStatus('Opening your company Microsoft sign-in…');
  window.location.assign(api('/api/auth/microsoft/start')+(moduleOrigin()?'?prompt=none':''));
}

function showProjectModuleDenied(){
 document.documentElement.removeAttribute('data-module-sso');
 const panel=$('#projectModuleDenied');
 panel?.classList.remove('hidden');
 $('#loginLanding').classList.remove('hidden');
 $('#appShell').classList.add('hidden');
 setLandingStatus('');
}
function navigateWarehouseModule(){
 // A local Project admin password is deliberately NOT transferred to Warehouse.
 window.location.assign(WAREHOUSE_REGISTRY_URL+'?from_module=projects&auto_sso=1');
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
  setText(el, t(message));
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
  setText($('#busyTitle'), t(title));
  setText($('#busyText'), t(detail));
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
  return t(roleNames[role] || role || '');
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
  userAccessDrafts.clear();
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
  setText(el, t(message));
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
    chip.title = t('Currently active on Project Register');
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
  if(loggedIn)document.documentElement.removeAttribute('data-module-sso');
  $('#loginLanding').classList.toggle('hidden', loggedIn);
  $('#appShell').classList.toggle('hidden', !loggedIn);
  $('#authLoggedOut').classList.toggle('hidden', loggedIn);
  $('#authLoggedIn').classList.toggle('hidden', !loggedIn);
  setText($('#authUserName'), state.user?.username || '');
  setText($('#authUserRole'), rolesLabel(state.user));
  setText($('#authBtn'),loggedIn?t('Sign out'):t('Sign in'));
  $('#authBtn').classList.toggle('btn-dark',!loggedIn);
  $('#projectIdentity').classList.toggle('hidden',!loggedIn);
  setText($('#projectIdentity'),loggedIn?state.user.username:'');
  renderOtherActiveUsers();
  $('#usersTab').classList.toggle('hidden', !state.user?.canManageUsers);
  $('#systemMessagesTab').classList.toggle('hidden', !state.user?.canManageUsers);
  const unread = $('#systemMessagesUnreadCount');
  if (unread) {
    unread.textContent = String(state.systemUnreadCount || 0);
    unread.classList.toggle('hidden', !state.systemUnreadCount);
  }
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
  document.documentElement.removeAttribute('data-module-sso');
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
  if (state.user.canManageUsers) void loadSystemMessages();
  render();
  // Wake the other Render service in the background; never block this screen.
  void fetch('https://hh-warehouse-api.onrender.com/api/health',{mode:'no-cors',cache:'no-store'}).catch(()=>{});
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

async function loadSystemMessages({ refreshView = true } = {}) {
  if (!state.user?.canManageUsers) return;
  const response = await request('/api/system-messages', { cache: 'no-store' });
  state.systemMessages = response.messages || [];
  state.systemUnreadCount = Number(response.unreadCount || 0);
  const badge = $('#systemMessagesUnreadCount');
  if (badge) {
    badge.textContent = String(state.systemUnreadCount);
    badge.classList.toggle('hidden', !state.systemUnreadCount);
  }
  if (refreshView && state.view === 'system') renderSystemMessages();
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
      return Object.values(p).some(v => String(v ?? '').toLowerCase().includes(q)) ||
        fieldText(p.status, 'status').toLocaleLowerCase().includes(q) ||
        fieldText(p.activityType, 'activityType').toLocaleLowerCase().includes(q);
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
    const span = document.createElement('span'); span.textContent = t(label);
    div.append(strong, span); metrics.append(div);
  }
}

// Excel-style column resizing for all register workspaces. Widths stay local
// to each device/browser, never enter project data, and are separate by view.
const COLUMN_WIDTH_STORAGE_KEY = 'hh-project-register-column-widths-v1';
const MIN_COLUMN_WIDTH = 66;
const MAX_COLUMN_WIDTH = 1500;

function columnLayoutKey(view = state.view) {
  if (view === 'overdue') return 'overdue';
  if (['all', 'plan', 'progress', 'completed', 'refusal'].includes(view)) return 'projects';
  if (view === 'customers') return canEditCustomers() ? 'customers-edit' : 'customers-view';
  if (view === 'audit') return 'history';
  if (view === 'users') return 'users';
  if (view === 'system') return 'system-inbox';
  return null;
}

function readColumnLayouts() {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function savedColumnWidths(key, count) {
  const value = readColumnLayouts()[key];
  return Array.isArray(value) && value.length === count &&
    value.every(width => Number.isFinite(width) &&
      width >= MIN_COLUMN_WIDTH && width <= MAX_COLUMN_WIDTH)
    ? value.slice() : null;
}

function storeColumnWidths(key, widths) {
  try {
    const layouts = readColumnLayouts();
    layouts[key] = widths.map(width => Math.round(width));
    localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(layouts));
  } catch (error) {
    console.warn('Column widths could not be saved in this browser:', error.message);
  }
}

function resetColumnWidths() {
  const key = columnLayoutKey();
  if (!key) return;
  try {
    const layouts = readColumnLayouts();
    delete layouts[key];
    localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(layouts));
  } catch (error) {
    console.warn('Could not reset stored column widths:', error.message);
  }
  render();
}

// Call after the table is attached to the document so its original column
// widths can be measured before applying user-defined widths.
function makeColumnsResizable(table, key = columnLayoutKey()) {
  if (!key || !table) return;
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  if (!headers.length || table.classList.contains('resizable-table')) return;
  const scale = table.closest('.workspace') ? state.tableZoom / 100 : 1;
  const naturalWidths = headers.map(th =>
    Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH,
      Math.round((th.getBoundingClientRect().width || th.offsetWidth || 100) / scale)
    ))
  );
  const widths = savedColumnWidths(key, headers.length) || naturalWidths.slice();

  const cols = document.createElement('colgroup');
  const elements = headers.map(() => {
    const col = document.createElement('col');
    cols.append(col);
    return col;
  });
  table.prepend(cols);
  table.classList.add('resizable-table');

  function applyWidths() {
    widths.forEach((width, index) => {
      elements[index].style.width = `calc(${width}px * var(--table-scale, 1))`;
    });
    const total = widths.reduce((sum, width) => sum + width, 0);
    const px = `calc(${total}px * var(--table-scale, 1))`;
    table.style.width = px;
    table.style.minWidth = px;
  }
  const adjust = (index, value) => {
    widths[index] = Math.max(MIN_COLUMN_WIDTH,
      Math.min(MAX_COLUMN_WIDTH, Math.round(value)));
    applyWidths();
  };
  applyWidths();

  headers.forEach((th, index) => {
    th.classList.add('resizable-column-heading');
    const handle = document.createElement('span');
    handle.className = 'column-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', getLanguage() === 'ru' ? `Изменить ширину столбца «${th.textContent.trim()}»` : `Resize ${th.textContent.trim()} column`);
    handle.setAttribute('aria-valuemin', String(MIN_COLUMN_WIDTH));
    handle.setAttribute('aria-valuemax', String(MAX_COLUMN_WIDTH));
    handle.setAttribute('aria-valuenow', String(widths[index]));
    handle.setAttribute('tabindex', '0');
    handle.title = t('Drag to resize · Double-click to reset · Arrow keys to adjust');

    const apply = value => {
      adjust(index, value);
      handle.setAttribute('aria-valuenow', String(widths[index]));
    };

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const initialX = event.clientX;
      const initialWidth = widths[index];
      let changed = false;
      document.body.classList.add('column-resize-dragging');
      handle.classList.add('is-resizing');

      const onMove = moveEvent => {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        const zoom = table.closest('.workspace') ? state.tableZoom / 100 : 1;
        const next = initialWidth + (moveEvent.clientX - initialX) / zoom;
        apply(next);
        if (widths[index] !== initialWidth) changed = true;
      };
      const onEnd = endEvent => {
        if (endEvent.pointerId !== pointerId) return;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onEnd);
        document.removeEventListener('pointercancel', onEnd);
        document.body.classList.remove('column-resize-dragging');
        handle.classList.remove('is-resizing');
        if (changed) storeColumnWidths(key, widths);
      };
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onEnd);
      document.addEventListener('pointercancel', onEnd);
    });
    handle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
      apply(naturalWidths[index]);
      storeColumnWidths(key, widths);
    });
    handle.addEventListener('keydown', event => {
      const step = event.shiftKey ? 25 : 10;
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const next = event.key === 'Home' ? naturalWidths[index]
        : widths[index] + (event.key === 'ArrowLeft' ? -step : step);
      apply(next);
      storeColumnWidths(key, widths);
    });
    th.append(handle);
  });
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
      sort.title = t(state.numberSortDirection === 'desc'
        ? 'Sort order number: oldest first' : 'Sort order number: newest first');
      sort.setAttribute('aria-label', sort.title);
      const text = document.createElement('span');
      text.textContent = t(label);
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
      th.textContent = t(label);
    }
    hr.append(th);
    if (showingOverdue && key === 'projectName') {
      for (const label of ['Update required', 'Overdue by']) {
        const extra = document.createElement('th'); extra.textContent = t(label); hr.append(extra);
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
        const span = document.createElement('span'); span.className = 'status-pill'; span.textContent = fieldText(p[key], 'status'); td.append(span);
      } else if (key === 'folderLink' && p.folderLink) {
        const a = document.createElement('a'); a.className = 'folder-link'; a.href = p.folderLink; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t('Open folder'); a.addEventListener('click', e => e.stopPropagation()); td.append(a);
      } else {
        td.textContent = key === 'activityType' ? fieldText(p[key], 'activityType') : escapeText(p[key]);
        td.title = td.textContent;
      }
      tr.append(td);
      if (showingOverdue && key === 'projectName') {
        const overdue = overdueProjectInfo(p);
        const reason = document.createElement('td');
        reason.className = 'overdue-reason';
        reason.textContent = overdue?.reasons.map(t).join('; ') || '';
        reason.title = reason.textContent;
        const days = document.createElement('td');
        days.textContent = overdue ? `${overdue.days} ${getLanguage() === 'ru' ? 'дн.' : 'd.'}` : '';
        tr.append(reason, days);
      }
    }
    tbody.append(tr);
  }
  table.append(tbody); wrap.append(table); content.replaceChildren(wrap);
  if (projects.length) makeColumnsResizable(table);
  if (!projects.length) {
    const message = state.editableOnly
      ? '<div class="empty-state"><div><h3>No editable projects</h3><p>Turn off Editable only or change the current view.</p></div></div>'
      : '<div class="empty-state"><div><h3>No matching projects</h3><p>Change the view or search term.</p></div></div>';
    content.innerHTML = message;
    localizeGeneratedUi(content);
    for (const el of content.querySelectorAll('h3,p')) el.textContent = t(el.textContent);
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
      edit.textContent = t('Edit');
      edit.addEventListener('click', e => {
        e.stopPropagation();
        openCustomers(c);
      });

      const del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.type = 'button';
      del.textContent = t('Delete');
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
  localizeGeneratedUi(content);
  makeColumnsResizable(table);
}

// The API supplies human-readable, allowlisted field changes. This view never
// renders arbitrary before/after snapshots or internal project credentials.
let changeHistoryVisibleRows = 250;

function changeHistoryDate(raw) {
  const value = new Date(raw);
  if (!Number.isFinite(value.getTime())) return String(raw || '—');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(value).map(part => [part.type, part.value]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

function changeHistoryValue(value, field) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  if (/^(Planned start|Planned end|Actual start|Actual end)$/.test(field) &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}.${month}.${year}`;
  }
  return raw;
}

// Each Audit Log entry is already one project operation. Keep it intact
// instead of expanding each changed field into a separate list row.
function changeHistoryEntries(entries, query = '') {
  const search = String(query || '').trim().toLocaleLowerCase();
  return (entries || []).filter(entry => {
    if (!entry || !Array.isArray(entry.changes)) return false;
    const kind = String(entry.changeType || '').toUpperCase();
    // Folder synchronization and technical/no-op saves are not business changes.
    if (!['EDIT', 'ADD', 'DELETE'].includes(kind)) return false;
    if (kind === 'EDIT' && !entry.changes.length) return false;
    if (!search) return true;
    const searchable = [
      entry.dateTime, changeHistoryDate(entry.dateTime), entry.user,
      entry.orderNumber, entry.projectName, kind, entry.summary,
      ...entry.changes.flatMap(change => [
        change.field, t(change.field), change.before, change.after,
        translateHistoryValue(change.before, change.field), translateHistoryValue(change.after, change.field)
      ])
    ];
    return searchable.some(value => String(value ?? '').toLocaleLowerCase().includes(search));
  });
}

function historyAction(entry) {
  if (entry.changeType === 'ADD') return t('Created');
  if (entry.changeType === 'DELETE') return t('Deleted');
  return t('Updated');
}

function historyChangeSummary(entry) {
  if (entry.changeType === 'ADD') return t('New project');
  if (entry.changeType === 'DELETE') return t('Project removed');
  const count = entry.changes.length;
  return getLanguage() === 'ru' ? `${count} ${count === 1 ? 'поле изменено' : 'полей изменено'}` : count + (count === 1 ? ' field changed' : ' fields changed');
}

let activeHistoryRecord = null;
function openChangeHistoryCard(entry) {
  activeHistoryRecord = entry;
  const dialog = $('#changeHistoryDialog');
  const title = [entry.orderNumber, entry.projectName].filter(Boolean).join(' — ');
  $('#changeHistoryDialogTitle').textContent = title || t('Project changes');
  $('#changeHistoryDialogMeta').textContent =
    changeHistoryDate(entry.dateTime) + ' · ' + (entry.user || 'Unknown user');
  const action = $('#changeHistoryDialogAction');
  action.textContent = historyAction(entry);
  action.dataset.action = entry.changeType || 'EDIT';

  const body = $('#changeHistoryDetailsBody');
  body.replaceChildren();
  const details = $('#changeHistoryDetailsWrap');
  const summary = $('#changeHistoryDetailSummary');
  if (entry.changeType !== 'EDIT') {
    summary.textContent = entry.changeType === 'ADD'
      ? t('This project was created.')
      : t('This project was deleted.');
    details.classList.add('hidden');
  } else {
    summary.textContent = historyChangeSummary(entry);
    details.classList.remove('hidden');
    for (const change of entry.changes) {
      const tr = document.createElement('tr');
      const cells = [
        [t(change.field || 'Field'), 'history-detail-field'],
        [changeHistoryValue(translateHistoryValue(change.before, change.field), change.field), 'history-detail-before'],
        [changeHistoryValue(translateHistoryValue(change.after, change.field), change.field), 'history-detail-after']
      ];
      for (const [value, className] of cells) {
        const td = document.createElement('td');
        td.textContent = value;
        td.className = className;
        if (value === '—') td.classList.add('history-empty');
        tr.append(td);
      }
      body.append(tr);
    }
  }
  if (!dialog.open) dialog.showModal();
}

function changeHistoryListRow(entry) {
  const tr = document.createElement('tr');
  tr.className = 'change-history-entry';
  tr.tabIndex = 0;
  tr.setAttribute('role', 'button');
  tr.setAttribute('aria-label', (getLanguage() === 'ru' ? 'Просмотреть: ' : 'View ') + historyAction(entry).toLowerCase() +
    ' history for project ' + [entry.orderNumber, entry.projectName].filter(Boolean).join(' '));

  const project = [entry.orderNumber, entry.projectName].filter(Boolean).join(' — ');
  const values = [
    [changeHistoryDate(entry.dateTime), 'history-list-date'],
    [project || '—', 'history-project'],
    [entry.user || '—', 'history-list-user'],
    [historyAction(entry), 'history-list-action'],
    [historyChangeSummary(entry), 'history-list-summary']
  ];
  for (const [value, className] of values) {
    const td = document.createElement('td');
    td.textContent = value;
    td.className = className;
    td.title = value;
    tr.append(td);
  }
  tr.addEventListener('click', () => openChangeHistoryCard(entry));
  tr.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openChangeHistoryCard(entry);
  });
  return tr;
}

function formatSystemTime(raw) {
  const date = new Date(raw);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki',
      dateStyle: 'short', timeStyle: 'short' }).format(date)
    : String(raw || '—');
}

function localizedSystemSubject(item) {
  const subject = String(item?.subject || '');
  if (getLanguage() !== 'ru') return subject;
  const names = [
    [/^Scheduled reminder accepted — Project (.*)$/i, 'Плановое напоминание принято — проект '],
    [/^Reminder could not be sent: Project (.*)$/i, 'Не удалось отправить напоминание — проект '],
    [/^Reminder delivery failed: Project (.*)$/i, 'Ошибка отправки напоминания — проект '],
    [/^Automatic reminders: (.*)$/i, 'Автоматические напоминания: '],
    [/^Cannot send project update: (.*)$/i, 'Невозможно отправить запрос обновления: '],
    [/^Project folder synchronization unavailable: (.*)$/i, 'Синхронизация папки недоступна: '],
    [/^Test notification — (.*)$/i, 'Тестовое уведомление — ']
  ];
  for (const [pattern, prefix] of names) {
    const match = subject.match(pattern);
    if (match) return prefix + match[1];
  }
  return t(subject);
}

function localizedSystemDetails(details) {
  const raw = String(details || '');
  if (getLanguage() !== 'ru') return raw;
  const prefixes = {
    'Scheduled run':'Плановый запуск', 'Project':'Проект',
    'Assigned manager':'Руководитель проекта', 'Recipient':'Получатель',
    'Sender':'Отправитель', 'Email subject':'Тема письма',
    'Status':'Статус', 'Error':'Ошибка', 'Reason':'Причина',
    'Endpoint':'Метод API', 'Microsoft Graph accepted':'Принято Microsoft Graph',
    'Projects requiring updates':'Проектов, требующих обновления',
    'Failed':'Ошибок'
  };
  return raw.split('\n').map(line => {
    const idx = line.indexOf(': ');
    if (idx < 0) return t(line);
    const key = line.slice(0, idx);
    return prefixes[key] ? prefixes[key] + line.slice(idx) : t(line);
  }).join('\n');
}

function systemMessageRow(item) {
  const tr = document.createElement('tr');
  tr.className = 'system-inbox-row' + (!item.readAt ? ' system-unread' : '');
  tr.tabIndex = 0;
  tr.setAttribute('role', 'button');
  tr.setAttribute('aria-label', 'Open system message: ' + item.subject);
  const values = [
    t(!item.readAt ? '● New' : 'Read'),
    formatSystemTime(item.at),
    t(item.type || 'SYSTEM'),
    localizedSystemSubject(item),
    item.project || '—'
  ];
  for (let i = 0; i < values.length; i++) {
    const td = document.createElement('td');
    td.textContent = values[i];
    if (i === 0) td.className = 'system-inbox-status';
    if (i === 3) td.className = 'system-inbox-subject';
    tr.append(td);
  }
  tr.addEventListener('click', () => { void openSystemMessage(item); });
  tr.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); void openSystemMessage(item);
    }
  });
  return tr;
}

function renderSystemMessages() {
  const content = $('#content');
  if (!state.user?.canManageUsers) {
    content.replaceChildren();
    return;
  }
  const q = $('#searchInput').value.trim().toLowerCase();
  const rows = state.systemMessages.filter(x => !q || [
    x.at, x.category, x.type, x.subject, x.details, x.project
  ].some(v => String(v || '').toLowerCase().includes(q)));

  const container = document.createElement('div');
  container.className = 'system-inbox';
  const toolbar = document.createElement('div');
  toolbar.className = 'system-inbox-toolbar';
  const count = document.createElement('span');
  count.textContent = getLanguage() === 'ru' ? `${state.systemUnreadCount} непрочитанных · ${state.systemMessages.length} сообщений` : state.systemUnreadCount + ' unread · ' + state.systemMessages.length + ' messages';
  const test = document.createElement('button');
  test.className = 'btn';
  test.type = 'button';
  test.textContent = t('Send test notification');
  test.addEventListener('click', async () => {
    test.disabled = true;
    try {
      await request('/api/system-messages/test', { method: 'POST', body: {} });
      await loadSystemMessages();
      showNotice('A test notification was added to System messages.');
    } catch (error) { showNotice(error.message, 'error'); }
    finally { test.disabled = false; }
  });
  toolbar.append(count, test);
  container.append(toolbar);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap system-inbox-wrap';
  const table = document.createElement('table');
  table.className = 'system-inbox-table';
  const head = document.createElement('thead');
  const headings = document.createElement('tr');
  ['Status', 'Date / time', 'Type', 'Message', 'Project'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = t(label);
    headings.append(th);
  });
  head.append(headings); table.append(head);
  const body = document.createElement('tbody');
  rows.forEach(item => body.append(systemMessageRow(item)));
  table.append(body);
  wrap.append(table); container.append(wrap);
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'change-history-empty';
    empty.textContent = t(q ? 'No matching system messages.' : 'No system messages yet.');
    container.append(empty);
  }
  content.replaceChildren(container);
  makeColumnsResizable(table);
}

let activeSystemMessage = null;
async function openSystemMessage(item) {
  activeSystemMessage = item;
  const dialog = $('#systemMessageDialog');
  $('#systemMessageSubject').textContent = localizedSystemSubject(item) || t('System message');
  $('#systemMessageMetadata').textContent =
    formatSystemTime(item.at) + ' · ' + t(item.category || 'SYSTEM') +
    ' · ' + t(item.type || 'ERROR') + (item.project ? ' · ' + t('Project') + ' ' + item.project : '');
  $('#systemMessageDetails').textContent = localizedSystemDetails(item.details) || t('No additional details.');
  dialog.showModal();
  if (item.readAt) return;
  try {
    const r = await request('/api/system-messages/' + encodeURIComponent(item.id) + '/read', {
      method: 'POST', body: {}
    });
    item.readAt = r.message?.readAt || new Date().toISOString();
    state.systemUnreadCount = Math.max(0, state.systemUnreadCount - 1);
    updateAuthUi();
    if (state.view === 'system') renderSystemMessages();
  } catch (error) {
    showNotice('Could not mark system message as read: ' + error.message, 'error');
  }
}

function renderAudit() {
  const content = $('#content');
  if (!state.user) return renderProjectTable();

  const query = $('#searchInput').value;
  const allEntries = changeHistoryEntries(state.audit);
  const filtered = changeHistoryEntries(state.audit, query);
  const container = document.createElement('div');
  container.className = 'change-history-container';

  const summary = document.createElement('div');
  summary.className = 'change-history-summary';
  summary.textContent = getLanguage() === 'ru'
    ? `${filtered.length} записей${query.trim() ? ' по запросу' : ''} · всего ${allEntries.length} · сначала новые`
    : filtered.length + ' change records' +
      (query.trim() ? ' matching search' : '') +
      ' · ' + allEntries.length + ' total · Most recent first';
  container.append(summary);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap change-history-wrap';
  const table = document.createElement('table');
  table.className = 'change-history-table';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Date / time', 'Project', 'Changed by', 'Action', 'Details'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = t(label);
    headRow.append(th);
  });
  head.append(headRow);
  table.append(head);

  const body = document.createElement('tbody');
  for (const entry of filtered.slice(0, changeHistoryVisibleRows)) {
    body.append(changeHistoryListRow(entry));
  }
  table.append(body);
  wrap.append(table);
  container.append(wrap);

  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'change-history-empty';
    empty.textContent = query.trim()
      ? t('No change records match your search.')
      : t('No project change records have been recorded yet.');
    container.append(empty);
  } else if (filtered.length > changeHistoryVisibleRows) {
    const footer = document.createElement('div');
    footer.className = 'change-history-more';
    const info = document.createElement('span');
    info.textContent = getLanguage() === 'ru' ? `Показано ${changeHistoryVisibleRows} из ${filtered.length}` : 'Showing ' + changeHistoryVisibleRows + ' of ' + filtered.length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = t('Show 250 more');
    button.addEventListener('click', () => {
      changeHistoryVisibleRows += 250;
      renderAudit();
    });
    footer.append(info, button);
    container.append(footer);
  }
  content.replaceChildren(container);
  makeColumnsResizable(table);
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
    text.textContent = t(label);
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

// Keep edits in memory when filtering or moving between tabs. Never store PINs in
// browser persistence; clear all drafts on logout or after a successful batch.
const userAccessDrafts = new Map();
let savingUserAccess = false;

function sameUserRoles(a, b) {
  const normalized = roles => [...new Set(roles || [])].sort().join('|');
  return normalized(a) === normalized(b);
}

function setUserAccessDraft(user, microsoftAccount, roles, password) {
  const previous = userAccessDrafts.get(user.username);
  const expected = previous?.expected || {
    microsoftAccount: user.microsoftAccount || '',
    roles: normalizeRoles(user)
  };
  const account = String(microsoftAccount || '');
  const pin = String(password || '');
  if (account.trim().toLowerCase() === String(expected.microsoftAccount || '').trim().toLowerCase() &&
      sameUserRoles(roles, expected.roles) && !pin) {
    userAccessDrafts.delete(user.username);
  } else {
    userAccessDrafts.set(user.username, {
      username: user.username,
      microsoftAccount: account,
      roles: [...roles],
      password: pin,
      expected
    });
  }
  refreshUserAccessSaveButton();
}

function refreshUserAccessSaveButton() {
  const button = $('#saveUserAccessBtn');
  const status = $('#userAccessDraftCount');
  if (!button || !status) return;
  const total = userAccessDrafts.size;
  button.disabled = savingUserAccess || total === 0;
  button.textContent = t(savingUserAccess ? 'Saving…' : 'Save changes');
  status.textContent = total
    ? (getLanguage() === 'ru' ? `${total} несохранённых изменений` : total + ' unsaved ' + (total === 1 ? 'user' : 'users'))
    : t('All changes saved');
  status.classList.toggle('unsaved', total > 0);
}

async function saveUserAccessChanges() {
  if (savingUserAccess || !state.user?.canManageUsers || !userAccessDrafts.size) return;
  const updates = [...userAccessDrafts.values()].map(draft => ({
    username: draft.username,
    microsoftAccount: draft.microsoftAccount,
    roles: [...draft.roles],
    ...(draft.password ? { password: draft.password } : {}),
    expected: {
      microsoftAccount: draft.expected.microsoftAccount,
      roles: [...draft.expected.roles]
    }
  }));
  for (const update of updates) {
    if (!update.roles.length) return showNotice('Select at least one role for ' + update.username + '.', 'error');
    const account = update.microsoftAccount.trim();
    if (account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) {
      return showNotice('Check the Microsoft account for ' + update.username + '.', 'error');
    }
  }
  savingUserAccess = true;
  refreshUserAccessSaveButton();
  const enabledControls = [...document.querySelectorAll('.users-page input:not(:disabled), .users-page button:not(:disabled)')];
  enabledControls.forEach(control => { control.disabled = true; });
  let committed = false;
  try {
    const result = await request('/api/users/batch', {
      method: 'PUT',
      headers: { 'X-Idempotency-Key': operationKey() },
      body: { updates }
    });
    committed = true;
    userAccessDrafts.clear();
    if (result.currentUser) {
      state.user = { ...state.user, ...result.currentUser };
      updateAuthUi();
    }
    await Promise.all([loadUsers(), refreshLookups()]);
    renderUsers();
    showNotice(result.updatedCount + ' ' +
      (result.updatedCount === 1 ? 'user updated.' : 'users updated.'));
  } catch (error) {
    // Preserve every unsaved field when a batch fails.
    showNotice(
      committed
        ? 'Changes were saved, but the list could not be refreshed: ' + error.message
        : 'Nothing was saved. ' + error.message,
      'error'
    );
  } finally {
    enabledControls.forEach(control => { if (control.isConnected) control.disabled = false; });
    savingUserAccess = false;
    refreshUserAccessSaveButton();
  }
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
  nameInput.placeholder = t('User name');
  nameInput.required = true;

  const microsoftInput = document.createElement('input');
  microsoftInput.type = 'email';
  microsoftInput.placeholder = t('Microsoft account');
  microsoftInput.required = true;

  const roleControl = makeRoleChecklist(['pm']);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.type = 'submit';
  addBtn.textContent = t('Add user');

  addCard.append(nameInput, microsoftInput, roleControl, addBtn);
  addCard.addEventListener('submit', async e => {
    e.preventDefault();
    if (savingUserAccess) return;
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

  const saveBar = document.createElement('div');
  saveBar.className = 'user-access-save-bar';
  const status = document.createElement('span');
  status.id = 'userAccessDraftCount';
  status.className = 'user-access-draft-count';
  status.setAttribute('role', 'status');
  const saveAll = document.createElement('button');
  saveAll.id = 'saveUserAccessBtn';
  saveAll.type = 'button';
  saveAll.className = 'btn btn-primary';
  saveAll.textContent = t('Save changes');
  saveAll.addEventListener('click', saveUserAccessChanges);
  saveBar.append(status, saveAll);
  container.append(saveBar);

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
    const draft = userAccessDrafts.get(u.username);
    const userRoles = draft ? draft.roles : normalizeRoles(u);
    const isMainAdmin = normalizeRoles(u).includes('admin');
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
    account.value = draft ? draft.microsoftAccount : (u.microsoftAccount || '');
    accountTd.append(account);

    if (u.microsoftLinked) {
      const linked = document.createElement('span');
      linked.className = 'account-linked';
      linked.textContent = t('Linked');
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
      pass.placeholder = t('New emergency PIN');
      pass.value = draft?.password || '';
      passwordTd.append(pass);
    } else {
      passwordTd.textContent = '—';
      passwordTd.className = 'muted';
    }

    const actionsTd = document.createElement('td');
    actionsTd.className = 'user-actions';

    // Track in-memory drafts instead of saving each row independently.
    const captureDraft = () => setUserAccessDraft(
      u, account.value, accessControl.getRoles(), pass?.value || ''
    );
    account.addEventListener('input', captureDraft);
    accessControl.addEventListener('change', captureDraft);
    pass?.addEventListener('input', captureDraft);

    if (!isMainAdmin) {
      const del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.type = 'button';
      del.textContent = t('Delete');
      del.addEventListener('click', async () => {
        if (savingUserAccess) return;
        const warning = userAccessDrafts.size
          ? (getLanguage() === 'ru' ? 'Несохранённые изменения других пользователей останутся в ожидании.\n\n' : 'Unsaved changes will remain pending for other users.\\n\\n') : '';
        if (!confirm(warning + (getLanguage() === 'ru' ? `Удалить пользователя ${u.username}?` : `Delete user ${u.username}?`))) return;

        try {
          await request(`/api/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
          userAccessDrafts.delete(u.username);
          await Promise.all([loadUsers(), refreshLookups()]);
          renderUsers();
          showNotice(t('User deleted.'));
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
  makeColumnsResizable(table);
  localizeGeneratedUi(content);
  refreshUserAccessSaveButton();
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
    expand.title = t(state.tableFullscreen ? 'Exit table fullscreen' : 'Open table fullscreen');
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
  $('#mailStubBtn').classList.toggle('hidden', state.view !== 'overdue' || !operationalAdmin);
  $('#editableOnlyControl').classList.toggle('hidden', !projectView || !canEdit);
  $('#editableOnlyToggle').checked = Boolean(state.editableOnly);
  $('#manageCustomersBtn').classList.toggle('hidden', state.view !== 'customers' || !canEditCustomers());
  const p = selectedProject();
  $('#editProjectBtn').disabled = !p || !p.canEdit;
  $('#openFolderBtn').disabled = !p || !localProjectFolderPath(p);
  $('#syncFolderBtn').disabled = !operationalAdmin || !p;
  $('#mailStubBtn').disabled = !operationalAdmin || bulkUpdateMail.sending || bulkUpdateMail.opening;
}

function render() {
  const [title, subtitle] = (viewInfo[state.view] || viewInfo.all).map(t);
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
  else if (state.view === 'system') renderSystemMessages();
  else renderProjectTable();
  localizeGeneratedUi($('#content'));
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

function fillSelect(select, values, blank = true, optionLabel = v => v) {
  const previous = select.value; select.replaceChildren(); if (blank) option(select, '', '—');
  [...new Set((values || []).filter(Boolean))].forEach(v => option(select, v, optionLabel(v)));
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
    if (!text.dataset.baseLabel) text.dataset.baseLabel = (text.dataset.i18nSource || text.textContent).replace(/\s*\*$/, '');
    text.textContent = t(text.dataset.baseLabel) + (required.has(field.name) ? ' *' : '');
    field.required = !readOnly && required.has(field.name);
  }
  const needsContact = form.elements.status.value !== 'Rejected';
  const contactHint = needsContact ? ' ' + t('Enter at least one contact: phone or email.') : '';
  $('#projectRequiredHelp').textContent = t('Fields marked * are required.') + contactHint;
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
      errors.push(`${t(fields[name]?.closest('.field')?.querySelector('span')?.dataset.baseLabel || name)} ${getLanguage() === 'ru' ? '— обязательное поле' : 'is required'}`);
    }
  }
  if (fields.status.value !== 'Rejected' && !fields.customerPhone.value.trim() && !fields.customerEmail.value.trim()) {
    mark('customerPhone');
    mark('customerEmail');
    errors.push(t('Enter a customer phone number or email address'));
  }
  if (fields.startPlan.value && fields.endPlan.value && fields.endPlan.value < fields.startPlan.value) {
    mark('endPlan'); errors.push(t('Planned end cannot be before planned start'));
  }
  if (fields.startFact.value && fields.endFact.value && fields.endFact.value < fields.startFact.value) {
    mark('endFact'); errors.push(t('Actual end cannot be before actual start'));
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
  fillSelect(f.status, state.lookups.statuses || ['In plan','Offer Preparation','Awaiting Client Decision','Confirmed','In Progress','Completed','Rejected'], true, v => fieldText(v, 'status'));
  fillSelect(f.activityType, state.lookups.activityTypes || [], true, v => fieldText(v, 'activityType'));
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
  if (closeBtn) closeBtn.textContent = t(readOnly ? 'Close' : 'Cancel');
}

// Edit leases protect one project at a time. Other projects stay available.
let projectEditLease = null;
let projectEditOpening = false;
let projectEditRefresh = null;
let projectEditRelease = Promise.resolve();

function stopProjectEditRefresh() {
  if (projectEditRefresh) clearInterval(projectEditRefresh);
  projectEditRefresh = null;
}
function releaseProjectEditorLease() {
  stopProjectEditRefresh();
  const lease = projectEditLease;
  projectEditLease = null;
  if (!lease) return;
  projectEditRelease = request(`/api/projects/${encodeURIComponent(lease.number)}/edit-lock`, {
    method: 'DELETE', body: { token: lease.token }, keepalive: true
  }).catch(() => {});
}
function projectEditorLockLost(reason) {
  stopProjectEditRefresh();
  projectEditLease = null;
  const notice = $('#projectLockNotice');
  notice.textContent = getLanguage() === 'ru'
    ? `Редактирование больше недоступно: ${reason}. Несохранённые значения остались в форме. Закройте проект и откройте его снова.`
    : 'Editing is no longer available. ' + reason +
      ' Your unsaved values remain visible; close and reopen the project before editing again.';
  notice.classList.remove('hidden');
  const project = state.projects.find(p => p.orderNumber === state.editingNumber);
  setProjectDialogMode({ project: project || { orderNumber: state.editingNumber }, readOnly: true });
  $('#projectValidation').textContent = reason;
  $('#projectValidation').classList.remove('hidden');
}
function startProjectEditRefresh(lease) {
  stopProjectEditRefresh();
  projectEditRefresh = setInterval(async () => {
    if (projectEditLease !== lease) return;
    try {
      await request(`/api/projects/${encodeURIComponent(lease.number)}/edit-lock`, {
        method: 'PUT', body: { token: lease.token }
      });
    } catch (error) {
      if (projectEditLease === lease) projectEditorLockLost(error.message);
    }
  }, 45000);
}

async function openProjectEditor(project = null) {
  if (!state.user) return $('#authDialog').showModal();

  if (!project && !canEditProjects()) {
    return showNotice('Your access level is read-only.', 'error');
  }

  if (projectEditOpening) return;
  projectEditOpening = true;
  await projectEditRelease;
  let readOnly = Boolean(project && !project.canEdit);
  let notice = '';
  try {
    if (project && !readOnly) {
      const lockUrl = `/api/projects/${encodeURIComponent(project.orderNumber)}/edit-lock`;
      let result = await request(lockUrl, { method: 'POST', body: {} });
      project = result.project || project;
      if (!result.acquired && result.sameAccount) {
        const confirmed = confirm(getLanguage() === 'ru'
          ? 'Этот проект уже открыт для изменения на другом устройстве под вашей учётной записью.\n\nПереключить редактирование на это устройство? На предыдущем устройстве останется только просмотр, несохранённые изменения НЕ будут перенесены.'
          : 'You are already editing this project in another window or on another device.\\n\\n' +
            'Switch editing to this device? The previous window will become read-only and ' +
            'any unsaved changes there will NOT be transferred.');
        if (confirmed) {
          result = await request(lockUrl, { method: 'POST', body: { takeOver: true } });
          project = result.project || project;
        } else {
          notice = getLanguage() === 'ru'
            ? 'Проект открыт на другом устройстве под вашей учётной записью. Закройте там форму или откройте здесь снова и подтвердите переключение.'
            : 'This project is open for editing under your account on another device. ' +
              'Close that editor, or reopen this project and confirm switching devices.';
        }
      }
      if (result.acquired) {
        projectEditLease = {
          number: String(project.orderNumber), token: result.token, revision: result.revision
        };
        startProjectEditRefresh(projectEditLease);
      } else {
        readOnly = true;
        if (!notice) {
          notice = result.sameAccount
            ? (getLanguage() === 'ru' ? 'Проект открыт в другом сеансе вашей учётной записи. Закройте его там для редактирования здесь.' : 'This project is open under your account in another session. Close it there to edit here.')
            : (getLanguage() === 'ru'
              ? `Проект сейчас редактирует ${result.lockedBy || 'другой пользователь'}. До закрытия его формы здесь доступен только просмотр.`
              : 'This project is being edited by ' + (result.lockedBy || 'another user') +
                '. It is available in read-only mode until they close the editor.');
        }
      }
    }
  } catch (error) {
    readOnly = true;
    notice = (getLanguage() === 'ru' ? 'Редактирование недоступно: ' : 'Editing is unavailable: ') + error.message;
    if (project) {
      try {
        const response = await request(`/api/projects/${encodeURIComponent(project.orderNumber)}`);
        project = response.project || project;
      } catch {}
    }
  } finally { projectEditOpening = false; }
  state.editingNumber = project?.orderNumber || null;

  setText(
    $('#projectModeLabel'),
    project
      ? `${t('PROJECT')} ${project.orderNumber}${readOnly ? ' · ' + t('READ ONLY') : ''}`
      : t('NEW PROJECT')
  );
  setText(
    $('#projectDialogTitle'),
    t(project ? (readOnly ? 'Project details' : 'Edit project') : 'Add project')
  );

  $('#projectValidation').classList.add('hidden');
  const lockNotice = $('#projectLockNotice');
  lockNotice.textContent = notice;
  lockNotice.classList.toggle('hidden', !notice);
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
  if (editing) {
    if (!projectEditLease || projectEditLease.number !== String(state.editingNumber)) {
      validation.textContent = getLanguage() === 'ru' ? 'Проект не закреплён за этим редактором. Закройте и откройте его снова.' : 'This project is not locked for editing. Close and reopen it.';
      validation.classList.remove('hidden');
      return;
    }
    payload._editLockToken = projectEditLease.token;
    payload._baseRevision = projectEditLease.revision;
  }
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
      idempotencyKey: operationKey(),
      editLockToken: projectEditLease?.token,
      baseRevision: projectEditLease?.revision
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
        _editLockToken: pendingDeleteChallenge.editLockToken,
        _baseRevision: pendingDeleteChallenge.baseRevision,
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
  makeColumnsResizable($('#customerDialog .table-wrap table'), 'customer-management');
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
  if (!confirm(getLanguage() === 'ru' ? `Удалить ${c.customer} / ${c.representative}?` : `Delete ${c.customer} / ${c.representative}?`)) return;
  try {
    await request(`/api/customers/${encodeURIComponent(c.id)}`, {method:'DELETE'});
    const r=await request('/api/customers');state.customers=r.customers||[];renderCustomerDialogRows();render();
  } catch(error){showNotice(error.message,'error');}
}

// Each project is mailed individually through the existing admin-only endpoint.
// Keep one idempotency key per project for safe retries during the same dialog session.
const bulkUpdateMail = {
  sending: false,
  opening: false,
  recipients: new Map(),
  requestKeys: new Map(),
  accepted: new Set()
};

function bulkMailInputs() {
  return [...$('#updateRequestsBody').querySelectorAll('input[type="checkbox"][data-number]')];
}

function updateMailSelectionUi() {
  const available = bulkMailInputs().filter(input => !input.disabled);
  const chosen = available.filter(input => input.checked);
  const selectAll = $('#updateRequestsSelectAll');
  selectAll.checked = available.length > 0 && chosen.length === available.length;
  selectAll.indeterminate = chosen.length > 0 && chosen.length < available.length;
  selectAll.disabled = bulkUpdateMail.sending || available.length === 0;
  $('#sendUpdateRequestsBtn').disabled = bulkUpdateMail.sending || chosen.length === 0;
  $('#updateRequestsSelectedCount').textContent = getLanguage() === 'ru' ? `${chosen.length} выбрано` : chosen.length + ' selected';
}

function setBulkSending(sending) {
  bulkUpdateMail.sending = sending;
  $('#closeUpdateRequestsBtn').disabled = sending;
  $('#cancelUpdateRequestsBtn').disabled = sending;
  for (const input of bulkMailInputs()) {
    input.disabled = sending || bulkUpdateMail.accepted.has(input.dataset.number)
      || !bulkUpdateMail.recipients.get(input.dataset.number)?.email;
  }
  updateMailSelectionUi();
  renderToolbar();
}

function markMailResult(number, status, message) {
  const row = [...$('#updateRequestsBody').rows].find(row => row.dataset.number === number);
  if (!row) return;
  const result = row.querySelector('.bulk-mail-result');
  result.className = 'bulk-mail-result ' + status;
  result.textContent = message;
  if (status === 'accepted') row.classList.add('bulk-mail-accepted');
}

async function openUpdateRequestsDialog() {
  if (!canOperateAdminTools() || state.view !== 'overdue' ||
      bulkUpdateMail.sending || bulkUpdateMail.opening) return;
  bulkUpdateMail.opening = true;
  renderToolbar();
  let recipients;
  try {
    const preview = await request('/api/mail/project-update-recipients', { cache: 'no-store' });
    recipients = preview.recipients || {};
  } catch (error) {
    showNotice('Cannot verify Project Manager email addresses: ' + error.message, 'error');
    return;
  } finally {
    bulkUpdateMail.opening = false;
    renderToolbar();
  }
  if (!canOperateAdminTools() || state.view !== 'overdue') return;
  bulkUpdateMail.recipients = new Map(Object.entries(recipients));
  bulkUpdateMail.accepted.clear();
  bulkUpdateMail.requestKeys.clear();
  const tbody = $('#updateRequestsBody');
  tbody.replaceChildren();
  const projects = state.projects.filter(p => overdueProjectInfo(p)).sort(compareProjectNumbers);
  for (const p of projects) {
    const overdue = overdueProjectInfo(p);
    const row = document.createElement('tr');
    row.dataset.number = String(p.orderNumber);
    const selectCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const recipient = bulkUpdateMail.recipients.get(String(p.orderNumber));
    checkbox.checked = Boolean(recipient?.email);
    checkbox.disabled = !recipient?.email;
    checkbox.dataset.number = String(p.orderNumber);
    checkbox.setAttribute('aria-label', 'Select project ' + p.orderNumber);
    checkbox.addEventListener('change', updateMailSelectionUi);
    selectCell.append(checkbox);
    row.append(selectCell);
    const values = [
      p.orderNumber, p.projectName,
      overdue ? overdue.reasons.map(t).join('; ') : '',
      overdue ? overdue.days + (getLanguage() === 'ru' ? ' дн.' : ' d.') : '',
      p.projectManager || '—'
    ];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = String(value ?? '');
      row.append(td);
    }
    const recipientInfo = document.createElement('small');
    recipientInfo.className = 'bulk-mail-recipient' + (recipient?.email ? '' : ' missing');
    recipientInfo.textContent = recipient?.email || t(recipient?.error || 'No registered Project Manager email');
    row.lastElementChild.append(recipientInfo);
    const result = document.createElement('span');
    result.className = 'bulk-mail-result';
    result.setAttribute('aria-live', 'polite');
    row.lastElementChild.append(result);
    if (!recipient?.email) row.classList.add('bulk-mail-no-recipient');
    tbody.append(row);
  }
  const sendable = projects.filter(p => bulkUpdateMail.recipients.get(String(p.orderNumber))?.email).length;
  $('#updateRequestsProgress').textContent = projects.length
    ? (getLanguage() === 'ru' ? `${sendable} из ${projects.length} проектов имеют адрес руководителя` : sendable + ' of ' + projects.length + ' projects have a registered Project Manager email.')
    : t('No projects currently require an update.');
  updateMailSelectionUi();
  $('#updateRequestsDialog').showModal();
  makeColumnsResizable($('#updateRequestsDialog .bulk-mail-table'), 'update-requests');
}

async function sendSelectedProjectUpdates() {
  if (bulkUpdateMail.sending || !canOperateAdminTools() || state.view !== 'overdue') return;
  const chosen = bulkMailInputs()
    .filter(input => input.checked && !input.disabled && !bulkUpdateMail.accepted.has(input.dataset.number))
    .map(input => input.dataset.number);
  if (!chosen.length) return;
  const prompt = getLanguage() === 'ru'
    ? `Отправить ${chosen.length} отдельных запросов на обновление проектов?\n\nОт: system@helsinginhitsaus.fi\nКому: назначенным руководителям проектов\n\nАдрес каждого получателя показан в таблице. Для каждого проекта будет отправлено отдельное письмо.`
    : 'Send ' + chosen.length + ' separate project update email'
      + (chosen.length === 1 ? '' : 's')
      + '?\n\nFrom: system@helsinginhitsaus.fi\nTo: the assigned Project Managers'
      + '\n\nThe recipient email for each project is shown in the table.'
      + '\nEach selected project will be emailed individually.';
  if (!confirm(prompt)) return;
  setBulkSending(true);
  let accepted = 0;
  let failed = 0;
  try {
    for (let i = 0; i < chosen.length; i++) {
      const number = chosen[i];
      $('#updateRequestsProgress').textContent = getLanguage() === 'ru'
        ? `Отправка ${i + 1} из ${chosen.length}: проект ${number}…`
        : 'Sending ' + (i + 1) + ' of ' + chosen.length + ': project ' + number + '…';
      let key = bulkUpdateMail.requestKeys.get(number);
      if (!key) {
        key = operationKey();
        bulkUpdateMail.requestKeys.set(number, key);
      }
      try {
        const response = await request('/api/mail/project-update-request', {
          method: 'POST',
          headers: { 'X-Idempotency-Key': key },
          body: { orderNumber: number, expectedRecipient: bulkUpdateMail.recipients.get(number)?.email }
        });
        if (!response.accepted) throw new Error('Microsoft 365 did not accept the request.');
        bulkUpdateMail.accepted.add(number);
        accepted++;
        markMailResult(number, 'accepted', (getLanguage() === 'ru' ? 'Принято Microsoft 365 для ' : 'Accepted by Microsoft 365 for ') + response.to);
      } catch (error) {
        failed++;
        markMailResult(number, 'failed', (getLanguage() === 'ru' ? 'Не подтверждено: ' : 'Not confirmed: ') + error.message);
      }
    }
    $('#updateRequestsProgress').textContent = getLanguage() === 'ru'
      ? `Завершено: принято ${accepted}, не подтверждено ${failed}.` + (failed ? ' ' + t('Review the errors below and retry only unsuccessful projects.') : '')
      : 'Finished: ' + accepted + ' accepted, ' + failed + ' not confirmed.'
        + (failed ? ' Review the errors below and retry only unsuccessful projects.' : '');
  } finally {
    setBulkSending(false);
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
  if ((view === 'users' || view === 'system') && !state.user?.canManageUsers) return;
  state.view=view; state.selectedNumber=null;
  $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));
  $('#searchInput').value='';
  try {
    if(view==='audit'&&state.user) await loadAudit();
    if(view==='users'&&state.user?.canManageUsers) await loadUsers();
    if(view==='system'&&state.user?.canManageUsers) await loadSystemMessages({ refreshView: false });
    render();
  } catch(e) { showNotice(e.message,'error'); }
}

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>activateView(btn.dataset.view)));
$('#zoomOutBtn')?.addEventListener('click', () => setTableZoom(state.tableZoom - 10));
$('#zoomInBtn')?.addEventListener('click', () => setTableZoom(state.tableZoom + 10));
$('#zoomLevelBtn')?.addEventListener('click', () => setTableZoom(100));
$('#fullscreenTableBtn')?.addEventListener('click', () => { state.tableFullscreen = !state.tableFullscreen; updateTableDisplay(); });
$('#resetColumnWidthsBtn')?.addEventListener('click', resetColumnWidths);

// Desktop: Ctrl + mouse wheel changes table zoom, without scaling the page.
$('.workspace')?.addEventListener('wheel', event => {
  if (!event.ctrlKey || !state.user || !['all','plan','progress','completed','refusal','overdue','audit','customers','users','system'].includes(state.view)) return;
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
window.setInterval(() => {
  if (state.user?.canManageUsers) {
    void loadSystemMessages().catch(error =>
      console.warn('System notifications refresh failed:', error.message));
  }
}, 60000);
$('#closeSystemMessageDialog')?.addEventListener('click', () => $('#systemMessageDialog').close());
$('#closeChangeHistoryDialog')?.addEventListener('click', () => $('#changeHistoryDialog').close());
$('#closeChangeHistoryFooter')?.addEventListener('click', () => $('#changeHistoryDialog').close());
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
$('#mailStubBtn').addEventListener('click',openUpdateRequestsDialog);
$('#sendUpdateRequestsBtn').addEventListener('click',sendSelectedProjectUpdates);
$('#updateRequestsSelectAll').addEventListener('change', event => {
  for (const input of bulkMailInputs()) {
    if (!input.disabled) input.checked = event.target.checked;
  }
  updateMailSelectionUi();
});
for (const id of ['closeUpdateRequestsBtn', 'cancelUpdateRequestsBtn']) {
  $('#' + id).addEventListener('click', () => {
    if (!bulkUpdateMail.sending) $('#updateRequestsDialog').close();
  });
}
$('#updateRequestsDialog').addEventListener('cancel', event => {
  if (bulkUpdateMail.sending) event.preventDefault();
});
$('#manageCustomersBtn').addEventListener('click',()=>openCustomers());
$('#projectModuleButton').addEventListener('click',navigateWarehouseModule);
$('#projectModuleReturn').addEventListener('click',()=>{window.location.assign(WAREHOUSE_REGISTRY_URL);});
async function logOutProject(){
 releaseProjectEditorLease();
 try{await request('/api/auth/logout',{method:'POST'});}catch{}
 $('#authDialog').close();
 clearSession({backendReady:true});
 showNotice('Signed out.');
}
$('#authBtn').addEventListener('click',()=>{
 if(state.user){void logOutProject();return;}
 $('#authDialog').showModal();
});
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
$('#logoutBtn').addEventListener('click',()=>{void logOutProject();});
$('#projectForm').addEventListener('submit',e=>{e.preventDefault();saveProject();});
$('#projectDialog').addEventListener('close', releaseProjectEditorLease);
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

// When switching from Warehouse, automatically attempt Entra SSO only once.
// If Microsoft needs interaction, normal sign-in remains available.
if(moduleSsoPending && moduleOrigin()){
 window.history.replaceState({},document.title,location.pathname);
 state.microsoftSignInQueued=true;
}
const openerInstallStatus = processOpenerInstallMarker();

// Capture original English markup before initial render. Translation does not
// touch stored business data, free-text inputs or Microsoft user identities.
initStaticTranslations();
const loginLanguageSelect=$('#loginLanguageSelect');
if(loginLanguageSelect){
 loginLanguageSelect.value=getLanguage();
 loginLanguageSelect.addEventListener('change',event=>{
  setLanguage(event.target.value);
  const main=$('#languageSelect');if(main)main.value=getLanguage();
  loginLanguageSelect.value=getLanguage();
  updateLandingMicrosoftButton();
  updateAuthUi();
  render();
 });
}
$('#projectAdminToggle').addEventListener('click',()=>{
 const group=$('#projectAdminForm'),button=$('#projectAdminToggle');
 const showing=group.classList.contains('hidden');
 group.classList.toggle('hidden',!showing);
 button.setAttribute('aria-expanded',String(showing));
 if(showing)$('#landingPinInput').focus();
});
const languageSelect = $('#languageSelect');
if (languageSelect) {
  languageSelect.value = getLanguage();
  languageSelect.addEventListener('change', event => {
    setLanguage(event.target.value);
    if(loginLanguageSelect)loginLanguageSelect.value=getLanguage();
    const form = $('#projectForm')?.elements;
    if (form) {
      for (const key of ['status', 'activityType']) {
        const select = form[key];
        if (!select) continue;
        for (const item of select.options) {
          if (item.value) item.textContent = fieldText(item.value, key);
        }
      }
      if ($('#projectDialog')?.open) {
        updateProjectRequiredFields();
        const readOnly = $('#projectForm').dataset.readOnly === 'true';
        const existing = state.projects.find(p => String(p.orderNumber) === String(state.editingNumber));
        setText($('#projectModeLabel'), existing
          ? t('PROJECT') + ' ' + existing.orderNumber + (readOnly ? ' · ' + t('READ ONLY') : '')
          : t('NEW PROJECT'));
        setText($('#projectDialogTitle'),
          t(existing ? (readOnly ? 'Project details' : 'Edit project') : 'Add project'));
        const closeBtn = $('#projectDialog .modal-actions .action-row [data-close-dialog]');
        if (closeBtn) closeBtn.textContent = t(readOnly ? 'Close' : 'Cancel');
      }
    }
    if ($('#changeHistoryDialog')?.open && activeHistoryRecord) {
      openChangeHistoryCard(activeHistoryRecord);
    }
    if ($('#systemMessageDialog')?.open && activeSystemMessage) {
      const item = activeSystemMessage;
      $('#systemMessageSubject').textContent = localizedSystemSubject(item) || t('System message');
      $('#systemMessageMetadata').textContent =
        formatSystemTime(item.at) + ' · ' + t(item.category || 'SYSTEM') +
        ' · ' + t(item.type || 'ERROR') +
        (item.project ? ' · ' + t('Project') + ' ' + item.project : '');
      $('#systemMessageDetails').textContent =
        localizedSystemDetails(item.details) || t('No additional details.');
    }
    updateLandingMicrosoftButton();
    updateAuthUi();
    render();
  });
}
setLanguage(getLanguage());
updateAuthUi();
render();

if (openerInstallStatus === 'installed') {
  setLandingStatus('Folder opener installed. You can sign in and use Open folder.');
}

const microsoftRedirectHandled = await completeMicrosoftSignIn();
if (!microsoftRedirectHandled) await ensureBackendReady();
updateAuthUi();
render();
