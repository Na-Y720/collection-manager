const STORAGE_KEY = 'collection-manager-personal-v1'
const $ = (id) => document.getElementById(id)
const state = { items: [], editingId: null, stream: null, scanning: false }

const yen = (value) => new Intl.NumberFormat('ja-JP', {
  style: 'currency', currency: 'JPY', maximumFractionDigits: 0,
}).format(Number(value || 0))

function show(el, visible = true) { el.classList.toggle('hidden', !visible) }
function setMessage(el, message = '') { el.textContent = message; show(el, Boolean(message)) }
function today() { return new Date().toISOString().slice(0, 10) }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}
function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function init() {
  loadLocal()
  bindEvents()
  $('purchaseDate').value = today()
  renderSummary()
  renderItems()
}

function bindEvents() {
  $('addButton').addEventListener('click', openNewForm)
  $('closeFormButton').addEventListener('click', closeForm)
  $('cancelButton').addEventListener('click', closeForm)
  $('collectionForm').addEventListener('submit', saveItem)
  $('searchInput').addEventListener('input', renderItems)
  $('janCode').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '') })
  $('scanButton').addEventListener('click', startScanner)
  $('stopScanButton').addEventListener('click', stopScanner)
  $('backupButton').addEventListener('click', exportBackup)
  $('importButton').addEventListener('click', () => $('importFile').click())
  $('importFile').addEventListener('change', importBackup)
  $('csvButton').addEventListener('click', exportCsv)
}

function loadLocal() {
  setMessage($('pageError'))
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    state.items = raw ? JSON.parse(raw) : []
    if (!Array.isArray(state.items)) state.items = []
  } catch {
    state.items = []
    setMessage($('pageError'), '保存データを読み込めませんでした。バックアップから復元してください。')
  }
}

function persist(message = '') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items))
  if (message) {
    setMessage($('pageSuccess'), message)
    setTimeout(() => setMessage($('pageSuccess')), 2200)
  }
}

function renderSummary() {
  const totals = state.items.reduce((acc, item) => {
    const qty = Number(item.quantity || 0)
    const purchase = Number(item.purchase_price || 0) * qty
    acc.purchase += purchase
    acc.units += qty
    if (item.current_price !== null && item.current_price !== '' && item.current_price !== undefined) {
      acc.current += Number(item.current_price || 0) * qty
      acc.valuedPurchase += purchase
      acc.valued += 1
    }
    return acc
  }, { purchase: 0, current: 0, valuedPurchase: 0, units: 0, valued: 0 })

  const profit = totals.current - totals.valuedPurchase
  const rate = totals.valuedPurchase > 0 ? (profit / totals.valuedPurchase) * 100 : 0
  $('purchaseTotal').textContent = yen(totals.purchase)
  $('currentTotal').textContent = yen(totals.current)
  $('valuedCount').textContent = `${totals.valued}/${state.items.length}商品を評価済み`
  $('profitTotal').textContent = `${profit >= 0 ? '+' : ''}${yen(profit)}`
  $('profitTotal').className = profit >= 0 ? 'gain' : 'loss'
  $('profitRate').textContent = `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`
  $('unitTotal').textContent = `${totals.units} 個`
  $('itemCount').textContent = `${state.items.length}登録`
}

function renderItems() {
  const q = $('searchInput').value.trim().toLowerCase()
  const items = state.items
    .filter((item) => !q || [item.name, item.jan_code, item.category, item.memo]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(q)))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))

  show($('emptyState'), items.length === 0)
  if (items.length === 0) {
    $('emptyTitle').textContent = state.items.length ? '該当する商品がありません' : 'まだコレクションがありません'
    $('emptyText').textContent = state.items.length ? '検索条件を変更してください。' : '最初の商品を登録してみましょう。'
  }

  $('itemGrid').innerHTML = items.map((item) => {
    const qty = Number(item.quantity || 0)
    const purchaseTotal = Number(item.purchase_price || 0) * qty
    const hasPrice = item.current_price !== null && item.current_price !== '' && item.current_price !== undefined
    const currentTotal = hasPrice ? Number(item.current_price || 0) * qty : null
    const profit = hasPrice ? currentTotal - purchaseTotal : null
    const query = encodeURIComponent(item.jan_code || item.name)
    return `
      <article class="item-card">
        <div class="item-head">
          <div>
            ${item.category ? `<span class="tag">${escapeHtml(item.category)}</span>` : ''}
            <h3>${escapeHtml(item.name)}</h3>
            ${item.jan_code ? `<div class="jan">JAN ${escapeHtml(item.jan_code)}</div>` : ''}
          </div>
          <div class="item-menu">
            <button class="mini-button edit-button" data-id="${item.id}" type="button">編集</button>
            <button class="mini-button danger delete-button" data-id="${item.id}" type="button">削除</button>
          </div>
        </div>
        <div class="item-metrics">
          <div><span>購入単価</span><strong>${yen(item.purchase_price)}</strong></div>
          <div><span>個数</span><strong>${qty}</strong></div>
          <div><span>購入総額</span><strong>${yen(purchaseTotal)}</strong></div>
          <div><span>現在相場</span><strong>${hasPrice ? yen(item.current_price) : '未登録'}</strong></div>
        </div>
        ${hasPrice ? `<div class="profit-line ${profit >= 0 ? 'gain-bg' : 'loss-bg'}">評価損益 <strong>${profit >= 0 ? '+' : ''}${yen(profit)}</strong></div>` : ''}
        ${(item.purchase_date || item.memo) ? `<div class="item-notes">${item.purchase_date ? `<span>購入日 ${escapeHtml(item.purchase_date)}</span>` : ''}${item.memo ? `<p>${escapeHtml(item.memo)}</p>` : ''}</div>` : ''}
        <div class="market-links">
          <span>現在相場を検索</span>
          <div>
            <a href="https://www.google.com/search?q=${query}" target="_blank" rel="noreferrer">Google</a>
            <a href="https://jp.mercari.com/search?keyword=${query}" target="_blank" rel="noreferrer">メルカリ</a>
            <a href="https://auctions.yahoo.co.jp/search/search?p=${query}" target="_blank" rel="noreferrer">Yahoo!オークション</a>
            <a href="https://search.rakuten.co.jp/search/mall/${query}/" target="_blank" rel="noreferrer">楽天市場</a>
          </div>
        </div>
      </article>`
  }).join('')

  document.querySelectorAll('.edit-button').forEach((button) => button.addEventListener('click', () => openEditForm(button.dataset.id)))
  document.querySelectorAll('.delete-button').forEach((button) => button.addEventListener('click', () => deleteItem(button.dataset.id)))
}

function openNewForm() {
  state.editingId = null
  $('collectionForm').reset()
  $('purchaseDate').value = today()
  $('quantity').value = 1
  $('formEyebrow').textContent = 'NEW'
  $('formTitle').textContent = 'コレクションを登録'
  $('saveButton').textContent = '登録する'
  show($('formCard'))
  $('name').focus()
}

function openEditForm(id) {
  const item = state.items.find((row) => row.id === id)
  if (!item) return
  state.editingId = id
  $('name').value = item.name || ''
  $('janCode').value = item.jan_code || ''
  $('category').value = item.category || ''
  $('purchaseDate').value = item.purchase_date || ''
  $('purchasePrice').value = item.purchase_price ?? ''
  $('quantity').value = item.quantity || 1
  $('currentPrice').value = item.current_price ?? ''
  $('memo').value = item.memo || ''
  $('formEyebrow').textContent = 'EDIT'
  $('formTitle').textContent = 'コレクションを編集'
  $('saveButton').textContent = '更新する'
  show($('formCard'))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function closeForm() {
  state.editingId = null
  show($('formCard'), false)
  setMessage($('scannerMessage'))
  stopScanner()
}

function saveItem(event) {
  event.preventDefault()
  setMessage($('pageError'))
  const name = $('name').value.trim()
  if (!name) return setMessage($('pageError'), '商品名を入力してください。')

  const existing = state.editingId ? state.items.find((row) => row.id === state.editingId) : null
  const item = {
    id: existing?.id || newId(),
    name,
    jan_code: $('janCode').value.trim() || null,
    category: $('category').value.trim() || null,
    purchase_date: $('purchaseDate').value || null,
    purchase_price: Number($('purchasePrice').value || 0),
    quantity: Math.max(1, Number($('quantity').value || 1)),
    current_price: $('currentPrice').value === '' ? null : Number($('currentPrice').value),
    memo: $('memo').value.trim() || null,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (existing) state.items = state.items.map((row) => row.id === item.id ? item : row)
  else state.items.unshift(item)

  persist(existing ? '更新しました。' : '登録しました。')
  closeForm()
  renderSummary()
  renderItems()
}

function deleteItem(id) {
  const item = state.items.find((row) => row.id === id)
  if (!item || !window.confirm(`「${item.name}」を削除しますか？`)) return
  state.items = state.items.filter((row) => row.id !== id)
  persist('削除しました。')
  renderSummary()
  renderItems()
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function exportBackup() {
  const payload = {
    app: 'collection-manager-personal',
    version: 1,
    exported_at: new Date().toISOString(),
    items: state.items,
  }
  const stamp = today().replaceAll('-', '')
  downloadFile(`collection-backup-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json')
  setMessage($('pageSuccess'), 'バックアップを書き出しました。')
  setTimeout(() => setMessage($('pageSuccess')), 2200)
}

async function importBackup(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const parsed = JSON.parse(await file.text())
    const items = Array.isArray(parsed) ? parsed : parsed.items
    if (!Array.isArray(items)) throw new Error('invalid')
    if (!window.confirm(`バックアップの${items.length}件で現在のデータを置き換えますか？`)) return
    state.items = items
    persist('バックアップを復元しました。')
    renderSummary()
    renderItems()
  } catch {
    setMessage($('pageError'), 'バックアップファイルを読み込めませんでした。')
  }
}

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return '"' + text.replaceAll('"', '""') + '"'
}

function exportCsv() {
  const headers = ['商品名','JANコード','カテゴリ','購入日','購入単価','個数','購入総額','現在相場','現在評価額','損益','メモ']
  const rows = state.items.map((item) => {
    const qty = Number(item.quantity || 0)
    const purchase = Number(item.purchase_price || 0)
    const purchaseTotal = purchase * qty
    const hasPrice = item.current_price !== null && item.current_price !== '' && item.current_price !== undefined
    const current = hasPrice ? Number(item.current_price || 0) : ''
    const currentTotal = hasPrice ? Number(current) * qty : ''
    const profit = hasPrice ? Number(currentTotal) - purchaseTotal : ''
    return [item.name,item.jan_code,item.category,item.purchase_date,purchase,qty,purchaseTotal,current,currentTotal,profit,item.memo]
  })
  const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const stamp = today().replaceAll('-', '')
  downloadFile(`collection-${stamp}.csv`, csv, 'text/csv;charset=utf-8')
  setMessage($('pageSuccess'), 'CSVを書き出しました。')
  setTimeout(() => setMessage($('pageSuccess')), 2200)
}

async function startScanner() {
  setMessage($('scannerMessage'))
  if (!('BarcodeDetector' in window)) return setMessage($('scannerMessage'), 'このブラウザはカメラJAN読取に未対応です。JANを手入力してください。')
  if (!navigator.mediaDevices?.getUserMedia) return setMessage($('scannerMessage'), 'この環境ではカメラを起動できません。JANを手入力してください。')
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    $('scannerVideo').srcObject = state.stream
    await $('scannerVideo').play()
    show($('scannerOverlay'))
    state.scanning = true
    scanLoop()
  } catch {
    setMessage($('scannerMessage'), 'カメラを起動できませんでした。カメラ権限をご確認ください。')
  }
}

async function scanLoop() {
  if (!state.scanning) return
  try {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8'] })
    const results = await detector.detect($('scannerVideo'))
    if (results?.[0]?.rawValue) {
      $('janCode').value = results[0].rawValue
      stopScanner()
      return
    }
  } catch {}
  if (state.scanning) requestAnimationFrame(scanLoop)
}

function stopScanner() {
  state.scanning = false
  state.stream?.getTracks().forEach((track) => track.stop())
  state.stream = null
  if ($('scannerVideo')) $('scannerVideo').srcObject = null
  show($('scannerOverlay'), false)
}

init()
