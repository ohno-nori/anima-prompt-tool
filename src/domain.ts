import { z } from 'zod';

export const CATEGORIES = [
  ['quality', '品質・メタ', 'Quality'], ['count', '人数', 'People'],
  ['character', 'キャラクター', 'Character'], ['series', '作品・シリーズ', 'Series'],
  ['artist', 'アーティスト', 'Artist'], ['appearance', '外見', 'Appearance'],
  ['outfit', '衣装・アクセサリー', 'Outfit'], ['pose', '表情・ポーズ', 'Expression'],
  ['composition', '構図・視点', 'Composition'], ['background', '背景・ライティング', 'Scene'],
  ['other', 'その他・自然文', 'Free text'], ['negative', 'ネガティブ', 'Negative'],
] as const;
export type Category = typeof CATEGORIES[number][0];
export const ids = CATEGORIES.map(c => c[0]);
export type Fields = Record<Category, string>;
export const emptyFields = (): Fields => Object.fromEntries(ids.map(id => [id, ''])) as Fields;
const categorySchema = z.enum(ids as [Category, ...Category[]]);
const short = z.string().max(2000);
const text = z.string().max(1000000);
const prompt = z.string().max(2500000);
const timestamp = z.string().datetime({ offset: true });
const fieldsSchema = z.object(Object.fromEntries(ids.map(id => [id, text])) as Record<Category, typeof text>).strict();
const identity = z.string().min(1).max(200);
const uniqueIds = z.array(identity).max(50000).refine(a => new Set(a).size === a.length);
const memoSchema = z.object({
  id: identity, title: short, positive: prompt, negative: prompt, fields: fieldsSchema,
  url: short.refine(v => !v || safeUrl(v) !== null, '投稿URLはhttp/httpsのみ利用できます'),
  note: text, createdAt: timestamp, updatedAt: timestamp, favorite: z.boolean(),
}).strict();
const historySchema = z.object({
  id: identity, tag: text.min(1), category: categorySchema, workIds: uniqueIds,
  lastUsedAt: timestamp, favorite: z.boolean(),
}).strict();
const stateSchema = z.object({
  schemaVersion: z.literal(1),
  draft: z.object({ fields: fieldsSchema, memoId: identity.nullable(), title: short, url: short, note: text }).strict(),
  memos: z.array(memoSchema).max(50000), history: z.array(historySchema).max(100000),
  defaults: fieldsSchema,
  settings: z.object({ theme: z.enum(['system', 'light', 'dark']), open: z.array(categorySchema).max(12), active: categorySchema, lastBackupAt: timestamp.nullable().optional() }).strict(),
}).strict();
export type AppState = z.infer<typeof stateSchema>;
export type Memo = z.infer<typeof memoSchema>;
export type HistoryTag = z.infer<typeof historySchema>;
export function initialState(): AppState {
  return { schemaVersion: 1, draft: { fields: emptyFields(), memoId: null, title: '', url: '', note: '' }, memos: [], history: [], defaults: emptyFields(), settings: { theme: 'system', open: ['appearance'], active: 'appearance' } };
}

// Extend this list to preserve additional model-specific underscore tokens.
export const UNDERSCORE_EXCEPTIONS = [/^score_\d+(?:_up)?$/i, /^__.+__$/];
export function normalizeTag(value: string, category: Category): string {
  let tag = value.trim().replace(/<[^>\r\n]*>|embedding:[^\s,()[\]]+|\\.|[A-Za-z0-9_]+/g, token => token.startsWith('<') || token.startsWith('embedding:') || token.startsWith('\\') || UNDERSCORE_EXCEPTIONS.some(rule => rule.test(token)) ? token : token.replaceAll('_', ' ')).trim();
  if (category === 'artist' && tag) {
    const weighted = tag.match(/^(\(+)(.*?)(:\s*[+-]?[\d.]+)?(\)+)$/);
    if (weighted) tag = `${weighted[1]}@${weighted[2].replace(/^@+/, '')}${weighted[3] || ''}${weighted[4]}`;
    else tag = '@' + tag.replace(/^@+/, '');
  }
  return tag;
}
export function segments(value: string): { start: number; end: number; value: string }[] {
  const result = []; const stack: string[] = []; let start = 0; let escaped = false; let quote = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { quote = quote ? '' : c; continue; }
    if (quote) continue;
    if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c) && stack.length) stack.pop();
    else if ((c === ',' || c === '\n' || c === '\r') && !stack.length) { result.push({ start, end: i, value: value.slice(start, i) }); start = i + 1; }
  }
  result.push({ start, end: value.length, value: value.slice(start) }); return result;
}
export const keyOf = (tag: string) => tag.toLocaleLowerCase();
export function parseTags(value: string, category: Category): string[] {
  const seen = new Set<string>();
  return segments(value).map(s => normalizeTag(s.value, category)).filter(tag => {
    const key = keyOf(tag); if (!tag || seen.has(key)) return false; seen.add(key); return true;
  });
}
export function outputs(fields: Fields) {
  return { positive: ids.filter(id => id !== 'negative').flatMap(id => parseTags(fields[id], id)).join(', '), negative: parseTags(fields.negative, 'negative').join(', ') };
}
export function toggleTag(value: string, tag: string, category: Category): string {
  const tags = parseTags(value, category); const normalized = normalizeTag(tag, category);
  return (tags.some(t => keyOf(t) === keyOf(normalized)) ? tags.filter(t => keyOf(t) !== keyOf(normalized)) : [...tags, normalized]).join(', ');
}
// Reorder the same normalized, deduplicated sequence used by chips and outputs.
export function reorderTag(value: string, category: Category, index: number, target: number): string {
  const tags = parseTags(value, category);
  if (!Number.isInteger(index) || !Number.isInteger(target) || index === target || index < 0 || index >= tags.length || target < 0 || target >= tags.length) return value;
  const [tag] = tags.splice(index, 1); tags.splice(target, 0, tag);
  const next = tags.join(', ');
  const parsed = parseTags(next, category);
  if (parsed.length !== tags.length || parsed.some((tag, i) => tag !== tags[i])) throw new Error('括弧や引用符が閉じていないタグがあります。入力欄で修正してから並び替えてください。');
  return next;
}
export function tokenAt(value: string, cursor: number) { return segments(value).find(s => cursor >= s.start && cursor <= s.end) ?? segments(value).at(-1)!; }
export function completeTag(value: string, cursor: number, tag: string, category: Category) {
  const token = tokenAt(value, cursor); const normalized = normalizeTag(tag, category);
  const others = segments(value).filter(s => s.start !== token.start).flatMap(s => parseTags(s.value, category));
  const replacement = others.some(t => keyOf(t) === keyOf(normalized)) ? '' : `${token.start > 0 ? ' ' : ''}${normalized}`;
  const text = value.slice(0, token.start) + replacement + value.slice(token.end);
  return { text, cursor: token.start + replacement.length };
}
export type TagSort = 'usage' | 'recent' | 'name';
export function searchHistory(history: HistoryTag[], category: Category, query = '', all = false, sort: TagSort = 'usage') {
  const q = keyOf(normalizeTag(query, category)).replace(/^@/, '');
  return history.filter(t => (all || t.category === category) && keyOf(t.tag).includes(q)).sort((a, b) =>
    Number(b.category === category) - Number(a.category === category) || Number(b.favorite) - Number(a.favorite) ||
    (sort === 'name' ? a.tag.localeCompare(b.tag) : sort === 'recent' ? b.lastUsedAt.localeCompare(a.lastUsedAt) : b.workIds.length - a.workIds.length || b.lastUsedAt.localeCompare(a.lastUsedAt)));
}
export function suggestions(history: HistoryTag[], category: Category, value: string, cursor: number) {
  const query = tokenAt(value, cursor).value.trim();
  if (!query) return [];
  const unique = new Set<string>();
  return searchHistory(history, category, query, true).filter(t => { const k = keyOf(normalizeTag(t.tag, category)); if (unique.has(k)) return false; unique.add(k); return true; }).slice(0, 6);
}
export function safeUrl(value: string): string | null {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function saveMemo(state: AppState, duplicate = false, now = new Date().toISOString(), newId: string = crypto.randomUUID()): AppState {
  const draft = state.draft;
  if (draft.url && !safeUrl(draft.url)) throw new Error('投稿URLは http:// または https:// で入力してください。');
  const old = duplicate ? undefined : state.memos.find(m => m.id === draft.memoId);
  const id = old?.id ?? newId;
  const fields = Object.fromEntries(ids.map(c => [c, parseTags(draft.fields[c], c).join(', ')])) as Fields;
  const memo: Memo = { id, title: draft.title.trim() || '無題の作品', ...outputs(fields), fields, url: draft.url, note: draft.note, createdAt: old?.createdAt ?? now, updatedAt: now, favorite: old?.favorite ?? false };
  const history = state.history.map(t => ({ ...t, workIds: t.workIds.filter(work => work !== id) }));
  for (const category of ids) for (const tag of parseTags(fields[category], category)) {
    const found = history.find(t => t.category === category && keyOf(t.tag) === keyOf(tag));
    if (found) { found.workIds.push(id); found.lastUsedAt = now; }
    // A deleted history entry stays deleted when an unchanged old memo is saved.
    else if (!old || !parseTags(old.fields[category], category).some(t => keyOf(t) === keyOf(tag))) {
      history.push({ id: crypto.randomUUID(), tag, category, workIds: [id], lastUsedAt: now, favorite: false });
    }
  }
  return { ...state, history, memos: old ? state.memos.map(m => m.id === id ? memo : m) : [memo, ...state.memos], draft: { ...draft, memoId: id, fields: { ...fields }, title: memo.title } };
}
export function deleteMemo(state: AppState, id: string): AppState {
  return { ...state, memos: state.memos.filter(m => m.id !== id), history: state.history.map(t => ({ ...t, workIds: t.workIds.filter(w => w !== id) })), draft: { ...state.draft, memoId: state.draft.memoId === id ? null : state.draft.memoId } };
}
export type MemoDetails = Pick<Memo, 'title' | 'url' | 'note'>;
export function updateMemoDetails(state: AppState, id: string, details: MemoDetails, now = new Date().toISOString()): AppState {
  if (!state.memos.some(m => m.id === id)) throw new Error('作品メモが見つかりません。');
  const title = details.title.trim() || '無題の作品';
  const url = details.url.trim();
  if (title.length > 2000 || url.length > 2000 || details.note.length > 200000) throw new Error('入力内容が長すぎます。');
  if (url && !safeUrl(url)) throw new Error('投稿URLは http:// または https:// で入力してください。');
  const metadata = { title, url, note: details.note };
  return {
    ...state,
    memos: state.memos.map(m => m.id === id ? { ...m, ...metadata, updatedAt: now } : m),
    draft: state.draft.memoId === id ? { ...state.draft, ...metadata } : state.draft,
  };
}
export function loadMemo(state: AppState, memo: Memo, categories?: Category[]): AppState {
  if (!categories) return { ...state, draft: { fields: { ...memo.fields }, memoId: memo.id, title: memo.title, url: memo.url, note: memo.note } };
  const fields = { ...state.draft.fields }; categories.forEach(c => fields[c] = memo.fields[c]);
  return { ...state, draft: { ...state.draft, fields } };
}
export function newDraftFromMemo(state: AppState, memo: Memo): AppState {
  const next = loadMemo(state, memo);
  return { ...next, draft: { ...next.draft, memoId: null, title: '', url: '', note: '' } };
}
export function newDraft(state: AppState): AppState { return { ...state, draft: { fields: { ...state.defaults }, memoId: null, title: '', url: '', note: '' } }; }
export type MemoFilter = { query: string; field: 'all' | 'title' | 'note' | 'prompt'; start: string; end: string; favorite: boolean; withoutUrl?: boolean; oldest: boolean };
export function localDate(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function searchMemos(memos: Memo[], filter: MemoFilter): Memo[] {
  return memos.filter(m => {
    const content = filter.field === 'title' ? m.title : filter.field === 'note' ? m.note : filter.field === 'prompt' ? `${m.positive} ${m.negative}` : `${m.title} ${m.note} ${m.positive} ${m.negative}`;
    const day = localDate(m.createdAt);
    return (!filter.withoutUrl || !safeUrl(m.url)) && (!filter.favorite || m.favorite) && (!filter.start || day >= filter.start) && (!filter.end || day <= filter.end) && keyOf(content).includes(keyOf(filter.query));
  }).sort((a, b) => filter.oldest ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
}
export function validateState(input: unknown): AppState {
  const state = stateSchema.parse(input);
  const memoIds = new Set(state.memos.map(m => m.id));
  if (memoIds.size !== state.memos.length || new Set(state.history.map(t => t.id)).size !== state.history.length || new Set(state.history.map(t => `${t.category}:${keyOf(t.tag)}`)).size !== state.history.length) throw new Error('IDまたは履歴タグが重複しています。');
  if (state.draft.memoId && !memoIds.has(state.draft.memoId)) throw new Error('編集中の作品IDが不正です。');
  for (const h of state.history) if (h.workIds.some(id => !memoIds.has(id))) throw new Error('タグ履歴の作品参照が不正です。');
  return state;
}
