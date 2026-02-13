/* ========================================================
   おうちストック - app.js
   ======================================================== */

// ===== Constants =====
const STORAGE_KEY = 'home-stock-data';
const BACKUP_PREFIX = 'home-stock-backup-';
const DEFAULT_CATEGORIES = ['食料品', '日用品', '消耗品', 'その他'];
const CATEGORY_COLORS = {
  '食料品': '#4CAF50',
  '日用品': '#2196F3',
  '消耗品': '#FF9800',
  'その他': '#9E9E9E'
};
const EXTRA_COLORS = ['#AB47BC', '#EF5350', '#26C6DA', '#8D6E63', '#78909C', '#EC407A', '#66BB6A', '#FFA726'];

// ===== State =====
let state = createDefaultState();
let currentTab = 'shopping';
let searchQuery = '';
let filterCategory = '';
let filterStatus = '';
let sortMode = 'recent';
let pendingImportData = null;

// ===== Helpers =====
function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function now() {
  return new Date().toISOString();
}

function createDefaultState() {
  return {
    version: 1,
    updatedAt: now(),
    updatedBy: '',
    categories: [...DEFAULT_CATEGORIES],
    shoppingItems: [],
    stockItems: []
  };
}

function getCategoryColor(cat) {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  const idx = state.categories.indexOf(cat);
  if (idx >= 0) {
    const extraIdx = idx - DEFAULT_CATEGORIES.length;
    if (extraIdx >= 0) return EXTRA_COLORS[extraIdx % EXTRA_COLORS.length];
  }
  return EXTRA_COLORS[Math.abs(hashCode(cat)) % EXTRA_COLORS.length];
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateForFile(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ===== Data Persistence =====
function saveState() {
  state.updatedAt = now();
  const username = localStorage.getItem('home-stock-username') || '';
  if (username) state.updatedBy = username;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    showToast('保存に失敗しました');
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validateData(parsed)) {
        state = parsed;
        return;
      }
    }
  } catch (e) {
    // fall through to default
  }
  state = createDefaultState();
  saveState();
}

function createBackup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const key = BACKUP_PREFIX + Date.now();
      localStorage.setItem(key, raw);
      cleanOldBackups();
      return key;
    }
  } catch (e) {
    // silently fail
  }
  return null;
}

function cleanOldBackups() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BACKUP_PREFIX)) {
      keys.push(key);
    }
  }
  keys.sort();
  while (keys.length > 10) {
    localStorage.removeItem(keys.shift());
  }
}

function getBackups() {
  const backups = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BACKUP_PREFIX)) {
      const ts = parseInt(key.replace(BACKUP_PREFIX, ''), 10);
      backups.push({ key, ts, date: new Date(ts) });
    }
  }
  backups.sort((a, b) => b.ts - a.ts);
  return backups;
}

function validateData(data) {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.categories)) return false;
  if (!Array.isArray(data.shoppingItems)) return false;
  if (!Array.isArray(data.stockItems)) return false;
  return true;
}

// ===== Render =====
function render() {
  renderHeaderMeta();
  renderFilterChips();
  renderShoppingList();
  renderStockList();
}

function renderHeaderMeta() {
  const el = document.getElementById('header-meta');
  let text = '';
  if (state.updatedAt) {
    text = '最終更新：' + formatDate(state.updatedAt);
  }
  if (state.updatedBy) {
    text += '　更新者：' + escapeHtml(state.updatedBy);
  }
  el.textContent = text;
}

function renderFilterChips() {
  const container = document.getElementById('filter-chips');
  let html = '<button class="chip' + (filterCategory === '' ? ' active' : '') + '" data-cat="">すべて</button>';
  state.categories.forEach((cat) => {
    const color = getCategoryColor(cat);
    const isActive = filterCategory === cat ? ' active' : '';
    html += `<button class="chip${isActive}" data-cat="${escapeHtml(cat)}">` +
            `<span class="cat-dot" style="background:${color}"></span>${escapeHtml(cat)}</button>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterCategory = btn.dataset.cat;
      render();
    });
  });
}

function getFilteredShopping() {
  let items = [...state.shoppingItems];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter((it) => it.name.toLowerCase().includes(q));
  }
  if (filterCategory) {
    items = items.filter((it) => it.category === filterCategory);
  }
  if (sortMode === 'category') {
    items.sort((a, b) => {
      const ai = state.categories.indexOf(a.category);
      const bi = state.categories.indexOf(b.category);
      if (ai !== bi) return ai - bi;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  } else {
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  // unchecked first
  items.sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
  return items;
}

function renderShoppingList() {
  const list = document.getElementById('shopping-list');
  const empty = document.getElementById('shopping-empty');
  const items = getFilteredShopping();

  if (items.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = items.map((item) => {
    const color = getCategoryColor(item.category);
    const checkedClass = item.checked ? ' checked' : '';
    const checkClass = item.checked ? ' checked' : '';
    return `<li class="item-card${checkedClass}" style="--cat-color:${color}" data-id="${item.id}">
      <div class="item-check${checkClass}" data-action="toggle" data-id="${item.id}"></div>
      <div class="item-body">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">
          <span class="cat-badge" style="--cat-color:${color}">
            <span class="cat-dot"></span>${escapeHtml(item.category)}
          </span>
        </div>
      </div>
      <div class="item-actions">
        <button class="item-action-btn delete-btn" data-action="delete-shopping" data-id="${item.id}" aria-label="削除">&times;</button>
      </div>
    </li>`;
  }).join('');

  list.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener('click', () => toggleShoppingItem(el.dataset.id));
  });
  list.querySelectorAll('[data-action="delete-shopping"]').forEach((el) => {
    el.addEventListener('click', () => deleteShoppingItem(el.dataset.id));
  });
}

function getFilteredStock() {
  let items = [...state.stockItems];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter((it) => it.name.toLowerCase().includes(q));
  }
  if (filterCategory) {
    items = items.filter((it) => it.category === filterCategory);
  }
  if (filterStatus) {
    items = items.filter((it) => it.status === filterStatus);
  }
  items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return items;
}

function renderStockList() {
  const list = document.getElementById('stock-list');
  const empty = document.getElementById('stock-empty');
  const items = getFilteredStock();

  if (items.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = items.map((item) => {
    const color = getCategoryColor(item.category);
    const showAddBtn = item.status === '少ない' || item.status === 'なし';
    const noteHtml = item.note ? `<div class="item-note">${escapeHtml(item.note)}</div>` : '';
    return `<li class="item-card" style="--cat-color:${color}" data-id="${item.id}">
      <div class="item-body">
        <div class="item-name">${escapeHtml(item.name)}</div>
        ${noteHtml}
        <div class="item-meta">
          <span class="cat-badge" style="--cat-color:${color}">
            <span class="cat-dot"></span>${escapeHtml(item.category)}
          </span>
          <span class="status-badge s-${item.status}">${item.status}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <div class="stock-status-btns">
          <button class="stock-status-btn${item.status === '十分' ? ' active' : ''}" data-status="十分" data-action="set-status" data-id="${item.id}">十分</button>
          <button class="stock-status-btn${item.status === '少ない' ? ' active' : ''}" data-status="少ない" data-action="set-status" data-id="${item.id}">少ない</button>
          <button class="stock-status-btn${item.status === 'なし' ? ' active' : ''}" data-status="なし" data-action="set-status" data-id="${item.id}">なし</button>
        </div>
        <div class="item-actions">
          ${showAddBtn ? `<button class="item-action-btn add-to-cart-btn" data-action="add-to-cart" data-id="${item.id}">買い物へ</button>` : ''}
          <button class="item-action-btn edit-btn" data-action="edit-stock" data-id="${item.id}" aria-label="編集">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="item-action-btn delete-btn" data-action="delete-stock" data-id="${item.id}" aria-label="削除">&times;</button>
        </div>
      </div>
    </li>`;
  }).join('');

  list.querySelectorAll('[data-action="set-status"]').forEach((el) => {
    el.addEventListener('click', () => setStockStatus(el.dataset.id, el.dataset.status));
  });
  list.querySelectorAll('[data-action="add-to-cart"]').forEach((el) => {
    el.addEventListener('click', () => addStockToShopping(el.dataset.id));
  });
  list.querySelectorAll('[data-action="edit-stock"]').forEach((el) => {
    el.addEventListener('click', () => openEditStock(el.dataset.id));
  });
  list.querySelectorAll('[data-action="delete-stock"]').forEach((el) => {
    el.addEventListener('click', () => deleteStockItem(el.dataset.id));
  });
}

// ===== Shopping Actions =====
function addShoppingItem(name, category) {
  const item = {
    id: generateId(),
    name: name.trim(),
    category,
    checked: false,
    createdAt: now(),
    updatedAt: now()
  };
  state.shoppingItems.push(item);
  saveState();
  render();
  showToast('追加しました');
}

function toggleShoppingItem(id) {
  const item = state.shoppingItems.find((it) => it.id === id);
  if (!item) return;
  item.checked = !item.checked;
  item.updatedAt = now();

  if (item.checked) {
    addOrUpdateStock(item.name, item.category);
  }

  saveState();
  render();
}

function deleteShoppingItem(id) {
  state.shoppingItems = state.shoppingItems.filter((it) => it.id !== id);
  saveState();
  render();
}

// ===== Stock Actions =====
function addStockItem(name, category, status, note) {
  const item = {
    id: generateId(),
    name: name.trim(),
    category,
    status: status || '十分',
    note: note || '',
    updatedAt: now()
  };
  state.stockItems.push(item);
  saveState();
  render();
  showToast('在庫に追加しました');
}

function updateStockItem(id, name, category, status, note) {
  const item = state.stockItems.find((it) => it.id === id);
  if (!item) return;
  item.name = name.trim();
  item.category = category;
  item.status = status;
  item.note = note || '';
  item.updatedAt = now();
  saveState();
  render();
  showToast('更新しました');
}

function deleteStockItem(id) {
  state.stockItems = state.stockItems.filter((it) => it.id !== id);
  saveState();
  render();
}

function setStockStatus(id, status) {
  const item = state.stockItems.find((it) => it.id === id);
  if (!item) return;
  item.status = status;
  item.updatedAt = now();
  saveState();
  render();
}

function addOrUpdateStock(name, category) {
  const existing = state.stockItems.find(
    (it) => it.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (existing) {
    existing.status = '十分';
    existing.category = category;
    existing.updatedAt = now();
  } else {
    state.stockItems.push({
      id: generateId(),
      name: name.trim(),
      category,
      status: '十分',
      note: '',
      updatedAt: now()
    });
  }
}

function addStockToShopping(stockId) {
  const item = state.stockItems.find((it) => it.id === stockId);
  if (!item) return;

  const exists = state.shoppingItems.find(
    (it) => it.name.trim().toLowerCase() === item.name.trim().toLowerCase() && !it.checked
  );
  if (exists) {
    showToast('既に買い物リストにあります');
    return;
  }

  state.shoppingItems.push({
    id: generateId(),
    name: item.name,
    category: item.category,
    checked: false,
    createdAt: now(),
    updatedAt: now()
  });
  saveState();
  render();
  showToast('買い物リストに追加しました');
}

// ===== Category Management =====
function addCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (state.categories.includes(trimmed)) {
    showToast('既に存在するカテゴリです');
    return false;
  }
  state.categories.push(trimmed);
  saveState();
  return true;
}

function deleteCategory(name) {
  if (DEFAULT_CATEGORIES.includes(name)) {
    showToast('初期カテゴリは削除できません');
    return false;
  }
  state.categories = state.categories.filter((c) => c !== name);
  saveState();
  return true;
}

// ===== Share & Import =====
function getExportData() {
  return JSON.stringify(state, null, 2);
}

function getExportFileName() {
  return 'home-stock-' + formatDateForFile(new Date()) + '.json';
}

async function shareFile() {
  const json = getExportData();
  const fileName = getExportFileName();
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], fileName, { type: 'application/json' });

  if (navigator.share) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'おうちストック データ',
        });
        showToast('共有しました');
        return;
      }
      // fallback: share as text
      await navigator.share({
        title: 'おうちストック データ',
        text: json,
      });
      showToast('共有しました');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      // fall through to manual
    }
  }
  showToast('共有メニューを開けません。下のボタンをお使いください。');
  document.getElementById('share-hint').textContent = 'お使いの環境では共有メニューに対応していません。下のコピー/ダウンロードをご利用ください。';
  document.getElementById('share-hint').hidden = false;
}

function copyJson() {
  const json = getExportData();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(json).then(() => {
      showToast('コピーしました');
    }).catch(() => {
      fallbackCopy(json);
    });
  } else {
    fallbackCopy(json);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    showToast('コピーしました');
  } catch (e) {
    showToast('コピーに失敗しました');
  }
  document.body.removeChild(ta);
}

function downloadJson() {
  const json = getExportData();
  const fileName = getExportFileName();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('ダウンロードしました。このファイルをAirDropで送ってください。');
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!validateData(data)) {
        showToast('無効なデータです：必須フィールドがありません');
        return;
      }
      pendingImportData = data;
      showImportConfirm(data);
    } catch (err) {
      showToast('JSONの読み込みに失敗しました');
    }
  };
  reader.onerror = () => {
    showToast('ファイルの読み込みに失敗しました');
  };
  reader.readAsText(file);
}

function showImportConfirm(data) {
  const summary = document.getElementById('import-summary');
  const lines = [];
  lines.push(`買い物リスト：${data.shoppingItems ? data.shoppingItems.length : 0} 件`);
  lines.push(`在庫リスト：${data.stockItems ? data.stockItems.length : 0} 件`);
  lines.push(`カテゴリ：${data.categories ? data.categories.length : 0} 件`);
  if (data.updatedAt) lines.push(`更新日時：${formatDate(data.updatedAt)}`);
  if (data.updatedBy) lines.push(`更新者：${escapeHtml(data.updatedBy)}`);
  summary.innerHTML = lines.join('<br>');

  closeModal('modal-share');
  openModal('modal-import-confirm');
}

function executeImport() {
  if (!pendingImportData) return;
  try {
    createBackup();
    state = pendingImportData;
    // Ensure all required fields exist
    if (!state.version) state.version = 1;
    if (!state.updatedAt) state.updatedAt = now();
    if (!state.updatedBy) state.updatedBy = '';
    if (!Array.isArray(state.categories)) state.categories = [...DEFAULT_CATEGORIES];
    if (!Array.isArray(state.shoppingItems)) state.shoppingItems = [];
    if (!Array.isArray(state.stockItems)) state.stockItems = [];
    saveState();
    render();
    closeModal('modal-import-confirm');
    showToast('データを取り込みました');
  } catch (e) {
    showToast('取り込みに失敗しました');
  }
  pendingImportData = null;
}

function restoreBackup(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      showToast('バックアップが見つかりません');
      return;
    }
    const data = JSON.parse(raw);
    if (!validateData(data)) {
      showToast('無効なバックアップデータです');
      return;
    }
    createBackup(); // backup current before restoring
    state = data;
    saveState();
    render();
    showToast('バックアップを復元しました');
    closeModal('modal-settings');
  } catch (e) {
    showToast('復元に失敗しました');
  }
}

// ===== UI Helpers =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.hidden = true; }, 2500);
}

function openModal(id) {
  document.getElementById(id).hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).hidden = true;
  if (!document.querySelector('.modal:not([hidden])')) {
    document.body.style.overflow = '';
  }
}

function populateCategorySelect() {
  const sel = document.getElementById('select-category');
  sel.innerHTML = state.categories.map(
    (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
  ).join('');
}

// ===== Modal: Add/Edit Item =====
function openAddModal() {
  const isStock = currentTab === 'stock';
  document.getElementById('modal-add-title').textContent = isStock ? '在庫を追加' : '買い物を追加';
  document.getElementById('group-status').hidden = !isStock;
  document.getElementById('group-note').hidden = !isStock;
  document.getElementById('btn-add-submit').textContent = '追加';
  document.getElementById('input-edit-id').value = '';
  document.getElementById('input-name').value = '';
  document.getElementById('input-note').value = '';
  populateCategorySelect();

  // Reset status buttons
  document.querySelectorAll('#modal-add .status-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === '十分');
  });

  openModal('modal-add');
  setTimeout(() => document.getElementById('input-name').focus(), 100);
}

function openEditStock(id) {
  const item = state.stockItems.find((it) => it.id === id);
  if (!item) return;

  document.getElementById('modal-add-title').textContent = '在庫を編集';
  document.getElementById('group-status').hidden = false;
  document.getElementById('group-note').hidden = false;
  document.getElementById('btn-add-submit').textContent = '更新';
  document.getElementById('input-edit-id').value = id;
  document.getElementById('input-name').value = item.name;
  document.getElementById('input-note').value = item.note || '';
  populateCategorySelect();
  document.getElementById('select-category').value = item.category;

  document.querySelectorAll('#modal-add .status-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === item.status);
  });

  openModal('modal-add');
}

function handleAddSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('input-name').value.trim();
  const category = document.getElementById('select-category').value;
  const editId = document.getElementById('input-edit-id').value;

  if (!name) {
    showToast('品名を入力してください');
    return;
  }

  if (currentTab === 'stock' || editId) {
    const statusBtn = document.querySelector('#modal-add .status-btn.active');
    const status = statusBtn ? statusBtn.dataset.value : '十分';
    const note = document.getElementById('input-note').value.trim();

    if (editId) {
      updateStockItem(editId, name, category, status, note);
    } else {
      addStockItem(name, category, status, note);
    }
  } else {
    addShoppingItem(name, category);
  }

  closeModal('modal-add');
}

// ===== Modal: Settings =====
function openSettings() {
  const usernameInput = document.getElementById('input-username');
  usernameInput.value = localStorage.getItem('home-stock-username') || '';

  renderCategoryList();
  renderBackupList();
  openModal('modal-settings');
}

function renderCategoryList() {
  const list = document.getElementById('category-list');
  list.innerHTML = state.categories.map((cat) => {
    const isDefault = DEFAULT_CATEGORIES.includes(cat);
    const color = getCategoryColor(cat);
    return `<li class="category-manage-item${isDefault ? ' is-default' : ''}">
      <span class="cat-label">
        <span class="cat-dot-lg" style="background:${color}"></span>
        ${escapeHtml(cat)}
      </span>
      <button class="delete-cat-btn" data-cat="${escapeHtml(cat)}" aria-label="削除">&times;</button>
    </li>`;
  }).join('');

  list.querySelectorAll('.delete-cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (deleteCategory(btn.dataset.cat)) {
        renderCategoryList();
        render();
      }
    });
  });
}

function renderBackupList() {
  const sel = document.getElementById('select-backup');
  const backups = getBackups();
  sel.innerHTML = '<option value="">バックアップを選択…</option>' +
    backups.map((b) => `<option value="${b.key}">${formatDate(b.date.toISOString())}</option>`).join('');
}

// ===== Event Binding =====
function bindEvents() {
  // Tabs
  document.querySelectorAll('#tab-bar .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      document.querySelectorAll('#tab-bar .tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + currentTab));
      render();
    });
  });

  // Sort buttons
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sortMode = btn.dataset.sort;
      document.querySelectorAll('.sort-btn').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });

  // Status filter
  document.querySelectorAll('.status-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterStatus = btn.dataset.status;
      document.querySelectorAll('.status-filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });

  // Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
  });

  // FAB
  document.getElementById('fab').addEventListener('click', openAddModal);

  // Add form
  document.getElementById('form-add').addEventListener('submit', handleAddSubmit);
  document.getElementById('btn-add-cancel').addEventListener('click', () => closeModal('modal-add'));

  // Status toggle buttons in add modal
  document.querySelectorAll('#modal-add .status-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modal-add .status-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('input-username').addEventListener('change', (e) => {
    localStorage.setItem('home-stock-username', e.target.value.trim());
    state.updatedBy = e.target.value.trim();
    saveState();
    renderHeaderMeta();
  });
  document.getElementById('btn-add-category').addEventListener('click', () => {
    const input = document.getElementById('input-new-category');
    if (addCategory(input.value)) {
      input.value = '';
      renderCategoryList();
      render();
    }
  });
  document.getElementById('input-new-category').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-add-category').click();
    }
  });
  document.getElementById('btn-restore-backup').addEventListener('click', () => {
    const sel = document.getElementById('select-backup');
    if (!sel.value) {
      showToast('バックアップを選択してください');
      return;
    }
    restoreBackup(sel.value);
  });

  // Share
  document.getElementById('btn-share').addEventListener('click', () => openModal('modal-share'));
  document.getElementById('btn-share-file').addEventListener('click', shareFile);
  document.getElementById('btn-copy-json').addEventListener('click', copyJson);
  document.getElementById('btn-download-json').addEventListener('click', downloadJson);
  document.getElementById('input-import-file').addEventListener('change', (e) => {
    handleImportFile(e.target.files[0]);
    e.target.value = ''; // reset for re-import
  });

  // Import confirm
  document.getElementById('btn-import-confirm').addEventListener('click', executeImport);
  document.getElementById('btn-import-cancel').addEventListener('click', () => {
    pendingImportData = null;
    closeModal('modal-import-confirm');
  });

  // Modal overlays & close buttons
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', () => {
      const modal = overlay.closest('.modal');
      if (modal) {
        closeModal(modal.id);
        pendingImportData = null;
      }
    });
  });
  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) {
        closeModal(modal.id);
        pendingImportData = null;
      }
    });
  });
}

// ===== PWA Service Worker =====
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // SW registration failed - app still works without it
    });
  }
}

// ===== Init =====
function init() {
  loadState();
  bindEvents();
  render();
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
