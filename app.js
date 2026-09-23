const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  apiUrl: 'https://project-register-api.onrender.com',
  token: sessionStorage.getItem('projectRegisterToken') || '',
  user: null,
  projects: [],
  customers: [],
  lookups: {},
  audit: [],
  users: [],
  oneDrive: { configured: false, connected: false },
  view: 'all',
  selectedNumber: null,
  editingNumber: null
};

const viewInfo = {
  all: ['All Projects', ''],
  plan: ['Projects in Plan', 'Projects currently in planning.'],
  progress: ['Projects in Progress', 'Active projects.'],
  completed: ['Completed Projects', 'Completed projects.'],
  refusal: ['Projects in Refusal', 'Rejected projects.'],
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
  ['viewer', 'View only'],
  ['pm', 'Edit own projects'],
  ['localAdmin', 'Edit all projects']
];

function api(path) { return `${state.apiUrl}${path}`; }

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  let response;
  try { response = await fetch(api(path), { ...options, headers }); }
  catch { throw new Error('Connection unavailable. Please try again.'); }
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') clearSession();
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
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

function roleLabel(role) {
  if (role === 'admin') return 'Main administrator';
  if (role === 'localAdmin') return 'Edit all projects';
  if (role === 'pm') return 'Edit own projects';
  if (role === 'viewer') return 'View only';
  return role || '';
}

function canEditProjects() {
  return state.user?.access === 'edit_all' || state.user?.access === 'edit_own';
}

function canEditAll() {
  return state.user?.access === 'edit_all';
}

function clearSession() {
  state.token = '';
  state.user = null;
  state.projects = [];
  state.customers = [];
  state.audit = [];
  state.users = [];
  state.selectedNumber = null;
  sessionStorage.removeItem('projectRegisterToken');
  if (state.view === 'users') state.view = 'all';
  updateAuthUi();
  render();
}

function updateAuthUi() {
  const loggedIn = Boolean(state.user);
  $('#authLoggedOut').classList.toggle('hidden', loggedIn);
  $('#authLoggedIn').classList.toggle('hidden', !loggedIn);
  setText($('#authUserName'), state.user?.username || '');
  setText($('#authUserRole'), roleLabel(state.user?.role));
  setText($('#authBtn'), loggedIn ? state.user.username : 'Sign in');
  $('#usersTab').classList.toggle('hidden', !state.user?.canManageUsers);
}

async function restoreSession() {
  if (!state.token) return;
  try {
    const { user } = await request('/api/auth/me');
    state.user = user;
    await loadCoreData();
  } catch { clearSession(); }
}

async function loadCoreData() {
  if (!state.user) return;
  const [projectResult, customerResult, lookupResult] = await Promise.all([
    request('/api/projects'), request('/api/customers'), request('/api/lookups')
  ]);
  state.projects = projectResult.projects || [];
  state.customers = customerResult.customers || [];
  state.lookups = lookupResult.lookups || {};
  if (state.view === 'audit') await loadAudit();
  if (state.view === 'users' && state.user.canManageUsers) await loadUsers();
  render();
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

function filteredProjects() {
  const q = $('#searchInput').value.trim().toLowerCase();
  return state.projects.filter(p => {
    if (state.view !== 'all' && projectGroup(p) !== state.view) return false;
    if (!q) return true;
    return Object.values(p).some(v => String(v ?? '').toLowerCase().includes(q));
  });
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
  if (!state.user) {
    content.innerHTML = '<div class="empty-state"><div><h3>Sign in</h3><p>Sign in to load data</p></div></div>';
    return;
  }
  const wrap = document.createElement('div'); wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const thead = document.createElement('thead'); const hr = document.createElement('tr');
  projectColumns.forEach(([, label]) => { const th = document.createElement('th'); th.textContent = label; hr.append(th); });
  thead.append(hr); table.append(thead);
  const tbody = document.createElement('tbody');
  for (const p of projects) {
    const tr = document.createElement('tr');
    tr.dataset.number = p.orderNumber;
    if (p.orderNumber === state.selectedNumber) tr.classList.add('selected');
    tr.addEventListener('click', () => selectProject(p.orderNumber));
    if (p.canEdit) tr.addEventListener('dblclick', () => openProjectEditor(p));
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
    }
    tbody.append(tr);
  }
  table.append(tbody); wrap.append(table); content.replaceChildren(wrap);
  if (!projects.length) content.innerHTML = '<div class="empty-state"><div><h3>No matching projects</h3><p>Change the view or search term.</p></div></div>';
}

function renderCustomers() {
  const content = $('#content');
  if (!state.user) return renderProjectTable();
  const q = $('#searchInput').value.trim().toLowerCase();
  const rows = state.customers.filter(x => !q || Object.values(x).some(v => String(v ?? '').toLowerCase().includes(q)));
  const wrap = document.createElement('div'); wrap.className = 'table-wrap';
  const table = document.createElement('table'); table.style.minWidth = '900px';
  table.innerHTML = '<thead><tr><th>Customer</th><th>Representative</th><th>Phone</th><th>Email</th></tr></thead>';
  const body = document.createElement('tbody');
  rows.forEach(c => {
    const tr = document.createElement('tr');
    [c.customer,c.representative,c.phone,c.email].forEach(v => { const td=document.createElement('td'); td.textContent=escapeText(v); tr.append(td); });
    if (canEditAll()) tr.addEventListener('dblclick', () => openCustomers(c));
    body.append(tr);
  });
  table.append(body); wrap.append(table); content.replaceChildren(wrap);
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

function makeRoleSelect(value, disabled = false) {
  const select = document.createElement('select');
  select.className = 'inline-select';
  for (const [role, label] of roleOptions) {
    const opt = document.createElement('option'); opt.value = role; opt.textContent = label;
    if (role === value) opt.selected = true;
    select.append(opt);
  }
  select.disabled = disabled;
  return select;
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
  addCard.innerHTML = '<div><strong>Add user</strong><span>Create a user and choose the access level.</span></div>';
  const nameInput = document.createElement('input'); nameInput.placeholder = 'User name'; nameInput.required = true;
  const roleSelect = makeRoleSelect('pm');
  const passwordInput = document.createElement('input'); passwordInput.type = 'password'; passwordInput.placeholder = 'Password'; passwordInput.required = true;
  const addBtn = document.createElement('button'); addBtn.className = 'btn btn-primary'; addBtn.type = 'submit'; addBtn.textContent = 'Add user';
  addCard.append(nameInput, roleSelect, passwordInput, addBtn);
  addCard.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await request('/api/users', { method: 'POST', body: { username: nameInput.value, role: roleSelect.value, password: passwordInput.value } });
      await Promise.all([loadUsers(), refreshLookups()]);
      renderUsers();
      showNotice('User added.');
    } catch (error) { showNotice(error.message, 'error'); }
  });
  container.append(addCard);

  const q = $('#searchInput').value.trim().toLowerCase();
  const users = state.users.filter(u => !q || u.username.toLowerCase().includes(q) || roleLabel(u.role).toLowerCase().includes(q));

  const wrap = document.createElement('div'); wrap.className = 'table-wrap users-table-wrap';
  const table = document.createElement('table'); table.className = 'users-table';
  table.innerHTML = '<thead><tr><th>User</th><th>Access</th><th>Password</th><th>Actions</th></tr></thead>';
  const body = document.createElement('tbody');

  for (const u of users) {
    const tr = document.createElement('tr');

    const userTd = document.createElement('td');
    const strong = document.createElement('strong'); strong.textContent = u.username; userTd.append(strong);

    const accessTd = document.createElement('td');
    let accessControl;
    if (u.role === 'admin') {
      accessControl = document.createElement('span'); accessControl.className = 'access-label'; accessControl.textContent = 'Main administrator';
    } else {
      accessControl = makeRoleSelect(u.role);
    }
    accessTd.append(accessControl);

    const passwordTd = document.createElement('td');
    const pass = document.createElement('input'); pass.type = 'password'; pass.className = 'password-reset'; pass.placeholder = 'New password (optional)';
    passwordTd.append(pass);

    const actionsTd = document.createElement('td'); actionsTd.className = 'user-actions';
    const save = document.createElement('button'); save.className = 'btn'; save.type = 'button'; save.textContent = 'Save';
    save.addEventListener('click', async () => {
      const payload = {};
      if (u.role !== 'admin') payload.role = accessControl.value;
      if (pass.value) payload.password = pass.value;
      if (!Object.keys(payload).length) return showNotice('Nothing to save.');
      try {
        await request(`/api/users/${encodeURIComponent(u.username)}`, { method: 'PUT', body: payload });
        pass.value = '';
        await Promise.all([loadUsers(), refreshLookups()]);
        renderUsers();
        showNotice('User updated.');
      } catch (error) { showNotice(error.message, 'error'); }
    });
    actionsTd.append(save);

    if (u.role !== 'admin') {
      const del = document.createElement('button'); del.className = 'btn btn-danger'; del.type = 'button'; del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm(`Delete user ${u.username}?`)) return;
        try {
          await request(`/api/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
          await Promise.all([loadUsers(), refreshLookups()]);
          renderUsers();
          showNotice('User deleted.');
        } catch (error) { showNotice(error.message, 'error'); }
      });
      actionsTd.append(del);
    }

    tr.append(userTd, accessTd, passwordTd, actionsTd);
    body.append(tr);
  }

  table.append(body); wrap.append(table); container.append(wrap);
  content.replaceChildren(container);
}

function renderToolbar() {
  const projectView = ['all','plan','progress','completed','refusal'].includes(state.view);
  const canEdit = canEditProjects();
  $('#addProjectBtn').classList.toggle('hidden', !projectView || !canEdit);
  $('#editProjectBtn').classList.toggle('hidden', !projectView || !canEdit);
  $('#openFolderBtn').classList.toggle('hidden', !projectView);
  $('#syncFolderBtn').classList.toggle('hidden', !projectView || !canEdit);
  $('#mailStubBtn').classList.toggle('hidden', !projectView);
  $('#manageCustomersBtn').classList.toggle('hidden', state.view !== 'customers' || !canEditAll());
  const p = selectedProject();
  $('#editProjectBtn').disabled = !p || !p.canEdit;
  $('#openFolderBtn').disabled = !p || !/^https?:\/\//i.test(String(p.folderLink || ''));
  $('#syncFolderBtn').disabled = !p || !p.canEdit;
  $('#mailStubBtn').disabled = !p || !state.user;
}

function render() {
  const [title, subtitle] = viewInfo[state.view] || viewInfo.all;
  setText($('#viewTitle'), title);
  setText($('#viewSubtitle'), subtitle);
  $('#viewSubtitle').classList.toggle('hidden', !subtitle);
  renderMetrics();
  updateAuthUi();
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
  updateDurations();
}

function openProjectEditor(project = null) {
  if (!state.user) return $('#authDialog').showModal();
  if (!canEditProjects()) return showNotice('Your access level is read-only.', 'error');
  if (project && !project.canEdit) return showNotice('You do not have permission to edit this project.', 'error');
  state.editingNumber = project?.orderNumber || null;
  setText($('#projectModeLabel'), project ? `PROJECT ${project.orderNumber}` : 'NEW PROJECT');
  setText($('#projectDialogTitle'), project ? 'Edit project' : 'Add project');
  $('#deleteProjectBtn').classList.toggle('hidden', !project);
  $('#projectValidation').classList.add('hidden');
  setFormProject(project || { status: 'In plan', projectManager: state.user?.access === 'edit_own' ? state.user.username : '' });
  $('#projectDialog').showModal();
}

function formPayload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const pm = form.elements.projectManager;
  if (pm.disabled) data.projectManager = pm.value;
  return data;
}

async function saveProject() {
  const validation = $('#projectValidation'); validation.classList.add('hidden');
  const payload = formPayload($('#projectForm'));
  try {
    let r;
    if (state.editingNumber) r = await request(`/api/projects/${encodeURIComponent(state.editingNumber)}`, { method: 'PUT', body: payload });
    else r = await request('/api/projects', { method: 'POST', body: payload });
    $('#projectDialog').close();
    state.selectedNumber = r.project.orderNumber;
    await loadCoreData();
    showNotice(state.editingNumber ? 'Project updated.' : `Project ${r.project.orderNumber} created.`);
  } catch (error) {
    validation.textContent = error.message; validation.classList.remove('hidden');
  }
}

async function deleteProject() {
  const p = selectedProject() || state.projects.find(x => x.orderNumber === state.editingNumber);
  if (!p || !confirm(`Delete project ${p.orderNumber} — ${p.projectName}?`)) return;
  try {
    await request(`/api/projects/${encodeURIComponent(p.orderNumber)}`, { method: 'DELETE' });
    $('#projectDialog').close(); state.selectedNumber = null; await loadCoreData(); showNotice('Project deleted.');
  } catch (error) { showNotice(error.message, 'error'); }
}

function openCustomers(editItem = null) {
  if (!state.user) return $('#authDialog').showModal();
  if (!canEditAll()) return showNotice('You do not have permission to edit customers.', 'error');
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

async function requestUpdateStub() {
  const p=selectedProject(); if(!p)return;
  try { const r=await request('/api/mail/project-update-request',{method:'POST',body:{orderNumber:p.orderNumber}}); showNotice(r.message); }
  catch(error){showNotice(error.message,'error');}
}

async function syncFolder() {
  const p = selectedProject();
  if (!p) return;
  try {
    const r = await request('/api/folders/sync', { method: 'POST', body: { orderNumber: p.orderNumber } });
    state.selectedNumber = r.project?.orderNumber || p.orderNumber;
    await loadCoreData();
    showNotice('Project folder synchronized.');
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

function openFolder() {
  const p=selectedProject(); if(!p?.folderLink)return;
  if (/^https?:\/\//i.test(p.folderLink)) window.open(p.folderLink,'_blank','noopener');
  else showNotice('Synchronize the project folder first.', 'error');
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

$$('.tab').forEach(btn=>btn.addEventListener('click',()=>activateView(btn.dataset.view)));
$('#searchInput').addEventListener('input',render);
$('#addProjectBtn').addEventListener('click',()=>openProjectEditor());
$('#editProjectBtn').addEventListener('click',()=>{const p=selectedProject();if(p)openProjectEditor(p);});
$('#openFolderBtn').addEventListener('click',openFolder);
$('#syncFolderBtn').addEventListener('click',syncFolder);
$('#mailStubBtn').addEventListener('click',requestUpdateStub);
$('#manageCustomersBtn').addEventListener('click',()=>openCustomers());
$('#authBtn').addEventListener('click',()=>$('#authDialog').showModal());
$$('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog')?.close()));

$('#authForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(state.user)return;
  try {
    const r=await request('/api/auth/login',{method:'POST',body:{password:$('#pinInput').value}});
    state.token=r.token;state.user=r.user;sessionStorage.setItem('projectRegisterToken',state.token);$('#pinInput').value='';$('#authDialog').close();await loadCoreData();showNotice(`Signed in as ${state.user.username}.`);
  } catch(error){showNotice(error.message,'error');}
});
$('#logoutBtn').addEventListener('click',async()=>{
  try{await request('/api/auth/logout',{method:'POST'});}catch{}
  $('#authDialog').close();clearSession();showNotice('Signed out.');
});
$('#projectForm').addEventListener('submit',e=>{e.preventDefault();saveProject();});
$('#deleteProjectBtn').addEventListener('click',deleteProject);
$('#projectForm').elements.customer.addEventListener('change',()=>refreshRepresentativeOptions());
$('#projectForm').elements.customerRepresentative.addEventListener('change',applyRepresentativeContact);
['startPlan','endPlan','startFact','endFact'].forEach(n=>$('#projectForm').elements[n].addEventListener('change',updateDurations));
$('#customerForm').addEventListener('submit',e=>{e.preventDefault();saveCustomer();});
$('#resetCustomerBtn').addEventListener('click',()=>{$('#customerForm').reset();$('#customerForm').elements.id.value='';});
$('#closeCustomerDialog').addEventListener('click',()=>$('#customerDialog').close());

await restoreSession();
render();
