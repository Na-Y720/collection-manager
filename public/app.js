import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'

const SUPABASE_URL = 'https://qflmmiyvbmubinqqphin.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_J3z6K_EZe6itArFsQm3nkA_LDxXGNc8'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const $ = (id) => document.getElementById(id)
const state = { session: null, items: [], authMode: 'signin', editingId: null, stream: null, scanning: false }

const yen = (value) => new Intl.NumberFormat('ja-JP', {
  style: 'currency', currency: 'JPY', maximumFractionDigits: 0,
}).format(Number(value || 0))

function show(el, visible = true) { el.classList.toggle('hidden', !visible) }
function setMessage(el, message = '') { el.textContent = message; show(el, Boolean(message)) }
function today() { return new Date().toISOString().slice(0, 10) }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

async function init() {
  bindEvents()
  $('purchaseDate').value = today()
  const { data } = await supabase.auth.getSession()
  await applySession(data.session)
  supabase.auth.onAuthStateChange(async (_event, session) => applySession(session))
  show($('loading'), false)
}

function bindEvents() {
  $('signinTab').addEventListener('click', () => setAuthMode('signin'))
  $('signupTab').addEventListener('click', () => setAuthMode('signup'))
  $('authForm').addEventListener('submit', handleAuth)
  $('signoutButton').addEventListener('click', () => supabase.auth.signOut())
  $('addButton').addEventListener('click', openNewForm)
  $('closeFormButton').addEventListener('click', closeForm)
  $('cancelButton').addEventListener('click', closeForm)
  $('collectionForm').addEventListener('submit', saveItem)
  $('searchInput').addEventListener('input', renderItems)
  $('janCode').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '') })
  $('scanButton').addEventListener('click', startScanner)
  $('stopScanButton').addEventListener('click', stopScanner)
}

async function applySession(session) {
  state.session = session
  show($('authView'), !session)
  show($('appView'), Boolean(session))
  if (session) await loadItems()
  else { state.items = []; renderSummary(); renderItems() }
}

function setAuthMode(mode) {
  state.authMode = mode
  $('signinTab').classList.toggle('active', mode === 'signin')
  $('signupTab').classList.toggle('active', mode === 'signup')
  $('authSubmit').textContent = mode === 'signin' ? 'ログイン' : '無料アカウントを作成'
  $('password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password'
  setMessage($('authError'))
  setMessage($('authSuccess'))
}

async function handleAuth(event) {
  event.preventDefault()
  setMessage($('authError'))
  setMessage($('authSuccess'))
  const email = $('email').value.trim()
  const password = $('password').value
  if (password.length < 6) return setMessage($('authError'), 'パスワードは6文字以上で入力してください。')

  $('authSubmit').disabled = true
  if (state.authMode === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setMessage($('authError'), error.message)
    else if (!data.session) setMessage($('authSuccess'), '確認メールを送信しました。メール内のリンクを開いて登録を完了してください。')
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage($('authError'), 'ログインできませんでした。メールアドレスとパスワードをご確認ください。')
  }
  $('authSubmit').disabled = false
}

async function loadItems() {
  setMessage($('pageError'))
  const { data, error } = await supabase.from('collections').select('*').order('created_at', { ascending: false })
  if (error) setMessage($('pageError'), error.message)
  else state.items = data || []
  renderSummary()
  renderItems()
}

function renderSummary() {
  const totals = state.items.reduce((acc, item) => {
    const qty = Number(item.quantity || 0)
    acc.purchase += Number(item.purchase_price || 0) * qty
    acc.units += qty
    if (item.current_price !== null) {
      acc.current += Number(item.current_price || 0) * qty
      acc.valued += 1
    }
    return acc
  }, { purchase: 0, current: 0, units: 0, valued: 0 })
  const profit = totals.current - totals.purchase
  const rate = totals.purchase > 0 ? (profit / totals.purchase) * 100 : 0
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
  const items = state.items.filter((item) => !q || [item.name, item.jan_code, item.category, item.memo]
    .filter(Boolean).some((value) => String(value).toLowerCase().includes(q)))

  show($('emptyState'), items.length === 0)
  if (items.length === 0) {
    $('emptyTitle').textContent = state.items.length ? '該当する商品がありません' : 'まだコレクションがありません'
    $('emptyText').textContent = state.items.length ? '検索条件を変更してください。' : '最初の商品を登録してみましょう。'
  }

  $('itemGrid').innerHTML = items.map((item) => {
    const qty = Number(item.quantity || 0)
    const purchaseTotal = Number(item.purchase_price || 0) * qty
    const hasPrice = item.current_price !== null
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

function closeForm() { state.editingId = null; show($('formCard'), false); setMessage($('scannerMessage')); stopScanner() }

async function saveItem(event) {
  event.preventDefault()
  setMessage($('pageError'))
  if (!state.session?.user?.id) return
  const name = $('name').value.trim()
  if (!name) return setMessage($('pageError'), '商品名を入力してください。')

  const payload = {
    user_id: state.session.user.id,
    name,
    jan_code: $('janCode').value.trim() || null,
    category: $('category').value.trim() || null,
    purchase_date: $('purchaseDate').value || null,
    purchase_price: Number($('purchasePrice').value || 0),
    quantity: Number($('quantity').value || 1),
    current_price: $('currentPrice').value === '' ? null : Number($('currentPrice').value),
    memo: $('memo').value.trim() || null,
    updated_at: new Date().toISOString(),
  }

  $('saveButton').disabled = true
  const request = state.editingId
    ? supabase.from('collections').update(payload).eq('id', state.editingId)
    : supabase.from('collections').insert(payload)
  const { error } = await request
  $('saveButton').disabled = false
  if (error) return setMessage($('pageError'), error.message)
  closeForm()
  await loadItems()
}

async function deleteItem(id) {
  const item = state.items.find((row) => row.id === id)
  if (!item || !window.confirm(`「${item.name}」を削除しますか？`)) return
  const { error } = await supabase.from('collections').delete().eq('id', id)
  if (error) return setMessage($('pageError'), error.message)
  state.items = state.items.filter((row) => row.id !== id)
  renderSummary(); renderItems()
}

async function startScanner() {
  setMessage($('scannerMessage'))
  if (!('BarcodeDetector' in window)) return setMessage($('scannerMessage'), 'このブラウザはカメラJAN読取に未対応です。JANを手入力してください。')
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
  } catch { /* 次フレームで再試行 */ }
  if (state.scanning) requestAnimationFrame(scanLoop)
}

function stopScanner() {
  state.scanning = false
  state.stream?.getTracks().forEach((track) => track.stop())
  state.stream = null
  $('scannerVideo').srcObject = null
  show($('scannerOverlay'), false)
}

init().catch((error) => {
  console.error(error)
  $('loading').textContent = '起動に失敗しました。ページを再読み込みしてください。'
})
