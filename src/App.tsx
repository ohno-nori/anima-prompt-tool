import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, Check, ChevronDown, ChevronRight, Copy, ExternalLink, FilePlus2, Leaf, Moon, Plus, Save, Search, Settings, SlidersHorizontal, Sparkles, Star, Sun, Trash2, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import MemoCollection, { EMPTY_MEMO_FILTER } from './MemoCollection';
import MemoDetailsEditor from './MemoDetailsEditor';
import SortableTags from './SortableTags';
import YamlImportPanel from './YamlImportPanel';
import { applyPromptImport } from './yamlImport';
import { updateMemoDetails } from './domain';
import { CATEGORIES, ids, initialState, parseTags, outputs, toggleTag, completeTag, suggestions, searchHistory, saveMemo, deleteMemo, loadMemo, newDraftFromMemo, newDraft, safeUrl, normalizeTag, keyOf, type AppState, type Category, type Memo, type MemoFilter, type TagSort } from './domain';
import { STORAGE_KEY, MAX_BACKUP_BYTES, browserStorage, loadState, persistState, exportBackup, importBackup, downloadText, copyText } from './storage';

const label = (id: Category) => CATEGORIES.find(c => c[0] === id)![1];
const APP_VERSION = '1.3.2';
const dateTime = (value: string) => new Date(value).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
type Commit = (updater: (s: AppState) => AppState) => boolean;
const ToastContext = createContext('');

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const message = useContext(ToastContext);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { d.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} className={`sheet ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="sheet-head"><h2>{title}</h2><button className="icon-button" aria-label="閉じる" onClick={onClose}><X /></button></div><div className="sheet-body">{children}</div>{message && <div className="sheet-message" role="status">{message}</div>}
  </dialog>;
}

function CategoryEditor({ category, index, state, commit, openHistory }: { category: Category; index: number; state: AppState; commit: Commit; openHistory: () => void }) {
  const [cursor, setCursor] = useState(0); const [focused, setFocused] = useState(false); const [composing, setComposing] = useState(false); const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const value = state.draft.fields[category]; const open = state.settings.open.includes(category);
  const tags = parseTags(value, category); const frequent = searchHistory(state.history, category).slice(0, 7);
  const candidates = focused && !composing ? suggestions(state.history, category, value, cursor) : [];
  const setValue = (text: string) => commit(s => ({ ...s, draft: { ...s.draft, fields: { ...s.draft.fields, [category]: text } } }));
  function accept(tag: string) {
    const next = completeTag(value, cursor, tag, category); setValue(next.text); setCursor(next.cursor); setFocused(false);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(next.cursor, next.cursor); });
  }
  const selected = (tag: string) => tags.some(t => keyOf(t) === keyOf(normalizeTag(tag, category)));
  return <section className={`category ${open ? 'expanded' : ''} ${state.settings.active === category ? 'active-category' : ''}`}>
    <button className="category-heading" aria-expanded={open} aria-controls={`body-${category}`} onClick={() => commit(s => ({ ...s, settings: { ...s.settings, active: category, open: open ? s.settings.open.filter(c => c !== category) : [...s.settings.open, category] } }))}>
      <span className="category-number">{String(index + 1).padStart(2, '0')}</span><span className="category-name">{label(category)}<span className="category-preview">{tags.length ? tags.join(', ') : CATEGORIES[index][2]}</span></span><span className={`tag-count ${tags.length ? 'filled' : ''}`}>{tags.length || '—'}</span>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
    </button>
    {open && <div className="category-body" id={`body-${category}`}>
      <label className="sr-only" htmlFor={`input-${category}`}>{label(category)}のタグ</label>
      <textarea id={`input-${category}`} ref={ref} value={value} maxLength={200000} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder={category === 'artist' ? 'artist_name → @artist name' : category === 'other' ? 'タグも自然な文章も、自由に入力できます' : 'タグを入力、または貼り付け…'} rows={3}
        aria-describedby={`hint-${category}`} aria-autocomplete="list" aria-controls={candidates.length ? `suggest-${category}` : undefined} aria-activedescendant={candidates.length ? `candidate-${category}-${Math.min(highlight, candidates.length - 1)}` : undefined}
        onFocus={() => { setFocused(true); commit(s => ({ ...s, settings: { ...s.settings, active: category } })); }}
        onBlur={() => setFocused(false)} onSelect={e => setCursor(e.currentTarget.selectionStart)}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={e => { setComposing(false); setCursor(e.currentTarget.selectionStart); }}
        onChange={e => { setValue(e.target.value); setCursor(e.target.selectionStart); setHighlight(0); setFocused(true); }}
        onKeyDown={e => { if (composing || e.nativeEvent.isComposing || !candidates.length) return; if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((highlight + 1) % candidates.length); } if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((highlight + candidates.length - 1) % candidates.length); } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); accept(candidates[Math.min(highlight, candidates.length - 1)].tag); } if (e.key === 'Escape') setFocused(false); }} />
      {!!candidates.length && <div id={`suggest-${category}`} className="suggestions" role="listbox" aria-label="入力補完候補">{candidates.map((t, i) => <button key={t.id} id={`candidate-${category}-${i}`} role="option" aria-selected={i === highlight} className={i === highlight ? 'highlight' : ''} onPointerDown={e => e.preventDefault()} onClick={() => accept(t.tag)}><span>{t.tag}</span><small>{label(t.category)}{t.favorite ? ' ★' : ''}</small></button>)}</div>}
      <p className="input-hint" id={`hint-${category}`}>カンマ・改行で区切り。変換は出力に反映されます。</p>
      <SortableTags value={value} category={category} onChange={setValue} />
      <div className="palette-label"><span>よく使うタグ</span><button className="text-button" onClick={openHistory}>すべて表示 <ChevronRight size={14} /></button></div>
      {frequent.length ? <div className="chips">{frequent.map(t => <button key={t.id} className={`chip ${selected(t.tag) ? 'selected' : ''}`} aria-pressed={selected(t.tag)} onClick={() => setValue(toggleTag(value, t.tag, category))}>{selected(t.tag) ? <Check size={13} /> : <Plus size={13} />}{t.tag}</button>)}</div> : <p className="empty-inline">作品メモを保存すると、ここにタグが育ちます。</p>}
      <button className="text-button default-action" onClick={() => { if (confirm(`「${label(category)}」の現在の内容を、新規プロンプトの初期値に登録します。よろしいですか？`)) commit(s => ({ ...s, defaults: { ...s.defaults, [category]: value } })); }}><SlidersHorizontal size={13} />この内容を初期値にする</button>
    </div>}
  </section>;
}

function HistoryPanel({ state, commit }: { state: AppState; commit: Commit }) {
  const [query, setQuery] = useState(''); const [all, setAll] = useState(false); const [sort, setSort] = useState<TagSort>('usage');
  const active = state.settings.active; const tags = parseTags(state.draft.fields[active], active);
  const results = searchHistory(state.history, active, query, all, sort);
  return <div className="history-panel">
    <div className="panel-eyebrow"><Leaf size={16} /> YOUR TAG PALETTE</div><h2>使うたび、育つパレット。</h2><p className="muted">保存した作品から、あなただけのタグを。</p>
    <label className="field-label">追加先のカテゴリ<select value={active} onChange={e => commit(s => ({ ...s, settings: { ...s.settings, active: e.target.value as Category } }))}>{CATEGORIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <div className="search-field"><Search size={17} /><input aria-label="タグ履歴を検索" placeholder="タグを検索…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="history-controls"><label className="check-label"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />全カテゴリ</label><select aria-label="タグの並び順" value={sort} onChange={e => setSort(e.target.value as TagSort)}><option value="usage">使用作品数順</option><option value="recent">最近使用した順</option><option value="name">名前順</option></select></div>
    <div className="palette-caption"><span>{results.length} tags</span><span>お気に入り優先</span></div>
    <div className="history-list">{results.length ? results.map(t => {
      const selected = tags.some(tag => keyOf(tag) === keyOf(normalizeTag(t.tag, active)));
      return <div key={t.id} className={`history-row ${selected ? 'is-selected' : ''}`}>
        <button className="history-tag" aria-pressed={selected} onClick={() => commit(s => ({ ...s, draft: { ...s.draft, fields: { ...s.draft.fields, [active]: toggleTag(s.draft.fields[active], t.tag, active) } } }))}><span>{selected ? <Check size={14} /> : <Plus size={14} />}{t.tag}</span><small>{label(t.category)} · {t.workIds.length}作品 · {new Date(t.lastUsedAt).toLocaleDateString('ja-JP')}</small></button>
        <button className={`icon-button ${t.favorite ? 'starred' : ''}`} aria-label={`${t.tag} ${t.favorite ? 'お気に入り解除' : 'お気に入り登録'}`} onClick={() => commit(s => ({ ...s, history: s.history.map(h => h.id === t.id ? { ...h, favorite: !h.favorite } : h) }))}><Star size={16} fill={t.favorite ? 'currentColor' : 'none'} /></button>
        <button className="icon-button subtle" aria-label={`${t.tag} を履歴から削除`} onClick={() => { if (confirm(`「${t.tag}」を履歴から削除します。作品メモは残ります。`)) commit(s => ({ ...s, history: s.history.filter(h => h.id !== t.id) })); }}><Trash2 size={15} /></button>
      </div>;
    }) : <div className="palette-empty"><div className="seed-icon"><Leaf size={28} strokeWidth={1.4} /></div><h3>{state.history.length ? '一致するタグがありません' : '最初のひとつから。'}</h3><p>{state.history.length ? 'キーワードやカテゴリを変えてみてください。' : '好きなタグを入力して、作品メモに保存。次の創作から、タップで呼び出せます。'}</p></div>}</div>
    <div className="palette-foot"><Sparkles size={15} /><p>コピーや入力だけでは履歴に登録されません。<br />作品メモを保存したときだけ記憶します。</p></div>
  </div>;
}

function OutputBlock({ title, text, onCopy }: { title: string; text: string; onCopy: (t: string) => void }) {
  return <div className="output-block"><div className="row-between"><h3>{title}</h3><button className="text-button" disabled={!text} onClick={() => onCopy(text)}><Copy size={14} />コピー</button></div><textarea aria-label={`${title}の最終出力`} readOnly value={text} rows={4} placeholder="タグを入力すると、ここに表示されます。" /><span className="character-count">{text.length.toLocaleString()} 文字</span></div>;
}

export default function App() {
  const [loaded] = useState(() => { try { return loadState(browserStorage); } catch { return { state: initialState(), error: 'ブラウザ内保存を利用できません。JSONバックアップをご利用ください。' }; } });
  const [state, setState] = useState(loaded.state); const stateRef = useRef(state);
  const [storageError, setStorageError] = useState<string | null>(loaded.error); const blocked = useRef(!!loaded.error);
  const [tab, setTab] = useState<'editor' | 'memos'>('editor');
  const [modal, setModal] = useState<'settings' | 'history' | 'output' | 'save' | 'yaml' | null>(null);
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [toast, setToast] = useState(''); const [detailId, setDetailId] = useState<string | null>(null);
  const [partial, setPartial] = useState<Category[] | null>(null); const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [keyboard, setKeyboard] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const [filter, setFilter] = useState<MemoFilter>({ ...EMPTY_MEMO_FILTER });
  const commit: Commit = updater => {
    const next = updater(stateRef.current); stateRef.current = next; setState(next);
    if (!blocked.current) { try { const error = persistState(browserStorage, next); setStorageError(error); return !error; } catch { setStorageError('ブラウザ内保存を利用できません。JSONバックアップを保存してください。'); } }
    return false;
  };
  const { needRefresh: [needRefresh], offlineReady: [offlineReady], updateServiceWorker } = useRegisterSW({ onRegisteredSW(_url, registration) { if (registration) { const check = () => { if (navigator.onLine) void registration.update().catch(() => {}); }; window.addEventListener('focus', check); setInterval(check, 60 * 60 * 1000); } }, onRegisterError() { setToast('オフライン機能の準備に失敗しました。オンラインで再読み込みしてください。'); } });
  const result = outputs(state.draft.fields); const total = ids.reduce((n, c) => n + parseTags(state.draft.fields[c], c).length, 0);
  const detail = state.memos.find(m => m.id === detailId);
  const detailUrl = detail ? safeUrl(detail.url) : null;
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)'); const apply = () => { const theme = state.settings.theme === 'system' ? media.matches ? 'dark' : 'light' : state.settings.theme; document.documentElement.dataset.theme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#20271f' : '#667653'); };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [state.settings.theme]);
  useEffect(() => {
    const viewport = window.visualViewport; const resize = () => setKeyboard(!!viewport && window.innerHeight - viewport.height > 120);
    const connection = () => setOnline(navigator.onLine);
    const external = (e: StorageEvent) => { if (e.key === STORAGE_KEY || e.key === null) { blocked.current = true; setStorageError('別のタブで保存データが変更されました。競合を防ぐため自動保存を停止しています。現在の入力をJSONで退避し、再読み込みしてください。'); } };
    viewport?.addEventListener('resize', resize); window.addEventListener('online', connection); window.addEventListener('offline', connection); window.addEventListener('storage', external);
    return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('storage', external); };
  }, []);
  async function copy(text: string) { try { await copyText(text); setToast('クリップボードにコピーしました'); } catch (e) { setToast((e as Error).message); } }
  function save(duplicate = false) {
    if (blocked.current) { setToast('自動保存が停止中です。先に設定でJSONを退避・復元してください。'); return; }
    try { const next = saveMemo(stateRef.current, duplicate); const persisted = commit(() => next); setModal(null); setToast(persisted ? '作品メモを保存しました' : '端末への保存に失敗しました。JSONで退避してください。'); } catch (e) { setToast((e as Error).message); }
  }
  function edit(m: Memo) { if (confirm('現在の全カテゴリと作品情報を、このメモの内容に置き換えます。よろしいですか？')) { commit(s => loadMemo(s, m)); setDetailId(null); setPartial(null); setTab('editor'); setToast('作品を読み込みました。保存すると上書きされます。'); } }
  async function importFile(file?: File) {
    if (!file) return;
    try { if (file.size > MAX_BACKUP_BYTES) throw new Error('ファイルサイズが20MBを超えています。'); setPendingImport(importBackup(await file.text())); } catch (e) { setToast((e as Error).message); }
  }
  function backup() {
    const now = new Date().toISOString();
    const next = { ...stateRef.current, settings: { ...stateRef.current.settings, lastBackupAt: now } };
    try {
      downloadText(exportBackup(next), `anima-backup-${now.slice(0, 10)}.json`);
      const recorded = commit(s => ({ ...s, settings: { ...s.settings, lastBackupAt: now } }));
      setToast(recorded ? 'JSONバックアップの書き出しを実行しました' : '書き出しを実行しましたが、日時を端末に保存できませんでした');
    } catch { setToast('JSONバックアップを書き出せませんでした。もう一度お試しください。'); }
  }
  return <ToastContext.Provider value={toast}>
    <header className="app-header"><div className="header-inner"><a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('editor'); }}><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /><span>Anima <span className="brand-light">Prompt Tool</span><small>YOUR WORDS, YOUR WORLD.</small></span></a><div className="header-actions"><span className="local-badge"><i />{online ? 'ローカルに保存' : 'オフライン'}</span><button className="icon-button" aria-label="設定・バックアップ" onClick={() => setModal('settings')}><Settings size={20} /></button></div></div></header>
    <main className="app-main">
      <nav className="tabs" aria-label="メイン画面"><button className={tab === 'editor' ? 'current' : ''} aria-current={tab === 'editor' ? 'page' : undefined} onClick={() => setTab('editor')}><SlidersHorizontal size={17} />プロンプト</button><button className={tab === 'memos' ? 'current' : ''} aria-current={tab === 'memos' ? 'page' : undefined} onClick={() => setTab('memos')}><BookOpen size={17} />作品メモ<span className="nav-count">{state.memos.length}</span></button><span className="tab-caption">A little collection of your imagination.</span></nav>
      {storageError && <div className="notice error" role="alert"><p>{storageError}</p><button onClick={backup}>JSONを退避</button><button onClick={() => setModal('settings')}>設定を開く</button></div>}
      {needRefresh && <div className="notice"><span>新しいバージョンを利用できます。</span><button onClick={() => { if (blocked.current) { setToast('保存停止中のため更新できません。先にJSONを退避してください。'); return; } const error = persistState(browserStorage, stateRef.current); if (error) setStorageError(error); else void updateServiceWorker(true).catch(() => setToast('更新に失敗しました。オンラインで再試行してください。')); }}>入力を保存して更新</button></div>}
      <div hidden={tab !== 'editor'}>
        <div className="workspace-title"><div><div className="eyebrow">PROMPT WORKSPACE</div><h1>ひとつずつ、イメージに。</h1><p>言葉を重ねて、あなたの世界を描こう。</p></div><button className="secondary" onClick={() => { if (confirm('現在の編集内容を初期値で置き換え、新規プロンプトを作成します。未保存の作品はJSONバックアップで退避できます。続けますか？')) commit(newDraft); }}><FilePlus2 size={17} />新規作成</button></div>
        <div className="editor-tools"><button className="text-button" onClick={() => setModal('yaml')}><ArrowUpFromLine size={15} />YAMLから一括読み込み</button></div>
        <div className="workspace-grid"><div className="editor-column"><div className="editor-status"><span><span className="status-dot" />{state.draft.memoId ? `編集中：${state.draft.title}` : '新しいプロンプト'}</span><span>{storageError ? '保存に注意' : '自動保存済み'} · {total} tags</span></div><div className="categories">{CATEGORIES.map(([id], i) => <CategoryEditor key={id} category={id} index={i} state={state} commit={commit} openHistory={() => { commit(s => ({ ...s, settings: { ...s.settings, active: id } })); setModal('history'); }} />)}</div><div className="editor-footnote"><Leaf size={14} /><span>あなたのタグと作品は、このブラウザの中だけに。</span></div></div><aside className="desktop-palette"><HistoryPanel state={state} commit={commit} /></aside></div>
      </div>
      {tab === 'memos' && <MemoCollection memos={state.memos} filter={filter} setFilter={setFilter} onOpen={id => { setMetadataDirty(false); setPartial(null); setDetailId(id); }} onEdit={() => setTab('editor')} />}
    </main>
    {tab === 'editor' && <footer className={`action-bar ${keyboard ? 'keyboard-open' : ''}`}><div className="action-inner"><span className="action-summary"><span className="status-dot" />{total} tags<small>イメージを、言葉に。</small></span><button className="secondary" onClick={() => copy(result.positive)} disabled={!result.positive}><Copy size={17} /><span>コピー</span></button><button className="secondary" onClick={() => setModal('output')}><ExternalLink size={17} /><span>出力</span></button><button className="primary" onClick={() => setModal('save')}><Save size={17} /><span>保存</span></button></div></footer>}
    {toast && !modal && !detail && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    {modal === 'history' && <Modal title="タグ履歴" onClose={() => setModal(null)}><HistoryPanel state={state} commit={commit} /></Modal>}
    {modal === 'yaml' && <Modal title="YAMLから一括読み込み" wide onClose={() => setModal(null)}><YamlImportPanel fields={state.draft.fields} onImport={(values, mode) => {
      if (blocked.current) return '自動保存が停止中です。先に設定でJSONを退避・復元してください。';
      try {
        const persisted = commit(s => applyPromptImport(s, values, mode));
        if (!persisted) return '画面には反映しましたが、端末への保存に失敗しました。JSONで退避してください。';
        setModal(null); setToast('YAMLのタグをプロンプトに読み込みました'); return null;
      } catch (e) { return (e as Error).message; }
    }} /></Modal>}
    {modal === 'output' && <Modal title="最終プロンプト" onClose={() => setModal(null)}><p className="muted">カテゴリ順に連結・変換した出力です。</p><OutputBlock title="ポジティブ" text={result.positive} onCopy={copy} /><OutputBlock title="ネガティブ" text={result.negative} onCopy={copy} /></Modal>}
    {modal === 'save' && <Modal title={state.draft.memoId ? '作品メモを更新' : '作品メモに保存'} onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); save(); }}>
      <p className="muted">今のプロンプトを記録し、使ったタグをパレットへ。</p>
      <label className="field-label">タイトル<input maxLength={2000} value={state.draft.title} placeholder="無題の作品" onChange={e => commit(s => ({ ...s, draft: { ...s.draft, title: e.target.value } }))} /></label>
      <label className="field-label">投稿URL <span>任意・http / https</span><input type="url" value={state.draft.url} placeholder="https://…" maxLength={2000} onChange={e => commit(s => ({ ...s, draft: { ...s.draft, url: e.target.value } }))} /></label>
      <label className="field-label">自由メモ <span>任意</span><textarea rows={4} value={state.draft.note} placeholder="モデル、生成設定、次に試したいこと…" maxLength={200000} onChange={e => commit(s => ({ ...s, draft: { ...s.draft, note: e.target.value } }))} /></label>
      <div className="save-summary">ポジティブ {result.positive.length} 文字 · ネガティブ {result.negative.length} 文字</div><div className="button-row">{state.draft.memoId && <button type="button" className="secondary" onClick={() => save(true)}><Copy size={16} />複製して新規保存</button>}<button className="primary" type="submit"><Save size={16} />{state.draft.memoId ? '上書き保存' : '作品を保存'}</button></div>
    </form></Modal>}
    {modal === 'settings' && <Modal title="設定・バックアップ" onClose={() => setModal(null)}>
      <section className="settings-section"><h3>表示テーマ</h3><div className="theme-options">{([['system', '端末に合わせる', Settings], ['light', 'ライト', Sun], ['dark', 'ダーク', Moon]] as const).map(([theme, name, Icon]) => <button className={state.settings.theme === theme ? 'selected' : ''} key={theme} aria-pressed={state.settings.theme === theme} onClick={() => commit(s => ({ ...s, settings: { ...s.settings, theme } }))}><Icon size={18} />{name}</button>)}</div></section>
      <section className="settings-section"><h3>JSONバックアップ</h3><p className="backup-status muted" aria-live="polite">最終書き出し：{state.settings.lastBackupAt ? <time dateTime={state.settings.lastBackupAt}>{dateTime(state.settings.lastBackupAt)}</time> : '未実施'}</p><p className="muted">作品・タグ履歴・編集中の内容・設定をまとめて保存。端末の移行にも使えます。</p><div className="button-row"><button className="primary" onClick={backup}><ArrowDownToLine size={17} />JSONを書き出す</button><label className="secondary file-button"><ArrowUpFromLine size={17} />JSONを読み込む<input type="file" accept=".json,application/json" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
      {blocked.current && <button className="secondary" onClick={() => { try { downloadText(localStorage.getItem(STORAGE_KEY) ?? '', 'anima-original-storage.json'); } catch { setToast('元データを読み取れませんでした。'); } }}>保存領域の元データを退避</button>}
      {pendingImport && <div className="import-confirm"><h3>バックアップで全データを置き換えます</h3><p>作品 {pendingImport.memos.length} 件 / 履歴 {pendingImport.history.length} 件。現在の作品・編集中の内容・初期値・設定は置き換わります。</p><p>必要な場合は先に「JSONを書き出す」で現在のデータを保存してください。</p><div className="button-row"><button className="secondary" onClick={() => setPendingImport(null)}>キャンセル</button><button className="primary" onClick={() => { const error = persistState(browserStorage, pendingImport); if (error) { setStorageError(error); return; } blocked.current = false; stateRef.current = pendingImport; setState(pendingImport); setStorageError(null); setPendingImport(null); setToast('バックアップを復元しました'); }}>すべて置き換えて復元</button></div></div>}</section>
      <section className="settings-section"><h3>新規作成時の初期値</h3><p className="muted">各カテゴリの「この内容を初期値にする」で登録できます。</p>{CATEGORIES.map(([id, name]) => <div className="default-row" key={id}><span>{name}<small>{state.defaults[id] || '未設定'}</small></span><button className="text-button" disabled={!state.defaults[id]} onClick={() => { if (confirm(`「${name}」の初期値を解除しますか？`)) commit(s => ({ ...s, defaults: { ...s.defaults, [id]: '' } })); }}>解除</button></div>)}</section>
      <section className="settings-section"><h3>iPhoneでアプリとして使う</h3><p className="muted">Safariの共有メニュー →「ホーム画面に追加」。初回はオンラインで開き、キャッシュ完了後はオフラインでも編集できます。</p><p className="pwa-status">{offlineReady || !online ? 'オフライン機能を利用できます' : '初回アクセス時にオフライン用ファイルを準備します'}</p><p className="muted">保存先はこの端末・ブラウザ内です。Safariとホーム画面アプリで同じデータが共有されるとは限りません。定期的にJSONを「ファイル」へ保存してください。</p></section><p className="version">Anima Prompt Tool · v{APP_VERSION}</p>
    </Modal>}
    {detail && <Modal title="作品メモ" wide onClose={() => { if (!metadataDirty || confirm('作品情報の未保存の変更を破棄して閉じますか？')) { setMetadataDirty(false); setDetailId(null); setPartial(null); } }}><div className="memo-detail-title"><h2>{detail.title}</h2><span>作成 {dateTime(detail.createdAt)}<br />更新 {dateTime(detail.updatedAt)}</span></div>{detailUrl && <div className="memo-saved-link"><a className="primary" href={detailUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />保存したリンクを開く<span className="sr-only">（別タブで開きます）</span></a><span className="memo-link-domain" title={new URL(detailUrl).hostname}>{new URL(detailUrl).hostname}</span></div>}<MemoDetailsEditor key={detail.id} memo={detail} onDirtyChange={setMetadataDirty} onSave={values => {
      if (blocked.current) return '自動保存が停止中です。先に設定でJSONを退避・復元してください。';
      try {
        const persisted = commit(s => updateMemoDetails(s, detail.id, values));
        if (!persisted) return '端末への保存に失敗しました。JSONで退避してください。';
        setToast('作品情報を保存しました'); return null;
      } catch (e) { return (e as Error).message; }
    }} /><OutputBlock title="ポジティブ" text={detail.positive} onCopy={copy} /><OutputBlock title="ネガティブ" text={detail.negative} onCopy={copy} />{detail.note && <div className="note-content"><h3>自由メモ</h3><p>{detail.note}</p></div>}
      <div className="button-row"><button className={`secondary ${detail.favorite ? 'starred' : ''}`} aria-pressed={detail.favorite} onClick={() => commit(s => ({ ...s, memos: s.memos.map(m => m.id === detail.id ? { ...m, favorite: !m.favorite } : m) }))}><Star size={16} fill={detail.favorite ? 'currentColor' : 'none'} />{detail.favorite ? 'お気に入り解除' : 'お気に入り登録'}</button><button className="secondary" disabled={metadataDirty} onClick={() => edit(detail)}>全体を読み込んで編集</button><button className="secondary" onClick={() => setPartial(partial === null ? [] : null)}>カテゴリを選んで読み込む</button></div>
      {partial !== null && <div className="partial-load"><p>チェックしたカテゴリだけを置き換えます。タイトル・投稿URL・自由メモは変更しません。</p><div className="category-checks">{CATEGORIES.map(([id, name]) => <label className="check-label" key={id}><input type="checkbox" checked={partial.includes(id)} onChange={e => setPartial(e.target.checked ? [...partial, id] : partial.filter(c => c !== id))} />{name}</label>)}</div><button className="primary" disabled={!partial.length || metadataDirty} onClick={() => { if (confirm(`選択した${partial.length}カテゴリの現在の内容を置き換えます。よろしいですか？`)) { commit(s => loadMemo(s, detail, partial)); setDetailId(null); setPartial(null); setTab('editor'); setToast('選択したカテゴリを読み込みました'); } }}>選択カテゴリを置き換える</button></div>}
      <div className="detail-bottom"><button className="secondary" disabled={metadataDirty} onClick={() => { if (confirm('編集中の全カテゴリをこの作品メモのタグで置き換え、タイトル・URL・コメントを空にして新規プロンプトを作成します。続けますか？')) { commit(s => newDraftFromMemo(s, detail)); setMetadataDirty(false); setDetailId(null); setPartial(null); setTab('editor'); setToast('メモを複写して新規プロンプトを作成しました'); } }}><Copy size={15} />複写して新規作成</button><button className="danger-button" disabled={metadataDirty} onClick={() => { if (confirm(`「${detail.title}」を削除します。この操作は取り消せません。`)) { commit(s => deleteMemo(s, detail.id)); setDetailId(null); setToast('作品メモを削除しました'); } }}><Trash2 size={15} />削除</button></div>
    </Modal>}
  </ToastContext.Provider>;
}
