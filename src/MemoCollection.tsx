import { useState } from 'react';
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, RotateCcw, SlidersHorizontal, Link, Star } from 'lucide-react';
import { localDate, safeUrl, searchMemos, type Memo, type MemoFilter } from './domain';

export const EMPTY_MEMO_FILTER: MemoFilter = {
  query: '', field: 'all', start: '', end: '', favorite: false, withoutUrl: false, oldest: false,
};

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="memo-date-field">
    <span>{label}</span>
    <span className="memo-date-control">
      <span className="memo-date-display" aria-hidden="true"><CalendarDays size={17} /><span>{value || '指定なし'}</span><ChevronDown size={15} /></span>
      <input type="date" aria-label={label} value={value} onChange={e => onChange(e.target.value)} />
    </span>
  </label>;
}

export default function MemoCollection({ memos, filter, setFilter, onOpen, onEdit }: {
  memos: Memo[];
  filter: MemoFilter;
  setFilter: (filter: MemoFilter) => void;
  onOpen: (id: string) => void;
  onEdit: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const filtered = searchMemos(memos, filter);
  const extraFilterActive = filter.field !== 'all' || filter.favorite || filter.withoutUrl;
  return <section className="memos-view" aria-label="保存した作品">
    <div className="memo-list-heading"><h1>保存した作品</h1><span aria-live="polite">{filtered.length}件</span></div>
    <div className="memo-search-controls">
      <div className="search-field memo-search"><input aria-label="作品メモを検索" placeholder="タイトル・タグ・メモを検索" value={filter.query} onChange={e => setFilter({ ...filter, query: e.target.value })} /></div>
      <div className="memo-date-range">
        <DateField label="開始日" value={filter.start} onChange={start => setFilter({ ...filter, start })} />
        <DateField label="終了日" value={filter.end} onChange={end => setFilter({ ...filter, end })} />
      </div>
      <div className="memo-sort-row">
        <button className="memo-clear" onClick={() => setFilter({ ...EMPTY_MEMO_FILTER })}><RotateCcw size={17} />条件クリア</button>
        <select aria-label="作品の並び順" value={filter.oldest ? 'old' : 'new'} onChange={e => setFilter({ ...filter, oldest: e.target.value === 'old' })}><option value="new">新しい順</option><option value="old">古い順</option></select>
        <button className={`icon-button memo-more-filters ${extraFilterActive ? 'selected' : ''}`} aria-label="詳細条件" title="検索対象・お気に入り・URL" aria-expanded={advanced} aria-controls="memo-extra-filters" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={18} />{extraFilterActive && <span className="filter-active-dot" />}</button>
      </div>
      {advanced && <div id="memo-extra-filters" className="memo-extra-filters">
        <label>検索対象<select value={filter.field} onChange={e => setFilter({ ...filter, field: e.target.value as MemoFilter['field'] })}><option value="all">すべて</option><option value="title">タイトル</option><option value="note">自由メモ</option><option value="prompt">プロンプト</option></select></label>
        <label className="check-label"><input type="checkbox" checked={filter.favorite} onChange={e => setFilter({ ...filter, favorite: e.target.checked })} />お気に入りのみ</label>
        <label className="check-label"><input type="checkbox" checked={!!filter.withoutUrl} onChange={e => setFilter({ ...filter, withoutUrl: e.target.checked })} />URLなしのみ</label>
      </div>}
      {filter.start && filter.end && filter.start > filter.end && <p className="error-text" role="alert">開始日を終了日以前にしてください。</p>}
    </div>
    <div className="memo-list">{filtered.map(m => <article className="memo-list-card" key={m.id}>
      <button className="memo-list-open" aria-label={`${m.title} 作品を開く`} onClick={() => onOpen(m.id)}>
        <span className="memo-list-main"><span className="memo-list-title">{m.favorite && <Star size={14} className="starred" fill="currentColor" />}{m.title}</span><time dateTime={m.createdAt}>{localDate(m.createdAt)}</time>{safeUrl(m.url) && <span className="memo-link-badge"><Link size={13} aria-hidden="true" />リンクあり</span>}</span>
        <ChevronRight className="memo-list-chevron" size={19} />
        <span className="memo-list-prompt">{m.positive || 'ポジティブプロンプトなし'}</span>
      </button>
    </article>)}</div>
    {!filtered.length && <div className="large-empty"><BookOpen size={36} strokeWidth={1.2} /><h2>{memos.length ? '条件に合う作品がありません' : 'まだ白紙のコレクション。'}</h2><p>{memos.length ? 'キーワードや日付の範囲を見直してみてください。' : 'プロンプトを作って「保存」をタップ。タグと一緒に、創作の記録を残せます。'}</p><button className="secondary" onClick={onEdit}>プロンプトを編集する</button></div>}
  </section>;
}
