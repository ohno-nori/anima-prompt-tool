import { describe, it, expect } from 'vitest';
import { CATEGORIES, initialState, normalizeTag, parseTags, segments, outputs, toggleTag, completeTag, suggestions, searchHistory, saveMemo, deleteMemo, loadMemo, newDraft, searchMemos, safeUrl, type AppState, type MemoFilter } from './domain';
import { STORAGE_KEY, loadState, persistState, exportBackup, importBackup } from './storage';

const time = '2026-11-05T10:00:00.000Z';
function seeded() { const s = initialState(); s.draft.title = '青い庭'; s.draft.fields.appearance = 'blue_eyes, very_long_hair'; s.draft.fields.negative = 'low_quality'; s.draft.note = '窓辺の光'; return s; }
function saved() { return saveMemo(seeded(), false, time, 'work-1'); }
const filter: MemoFilter = { query: '', field: 'all', start: '', end: '', favorite: false, oldest: false };
describe('タグ変換と構文', () => {
  it.each([['very_long_hair', 'very long hair'], ['low_twintails', 'low twintails'], ['looking_at_viewer', 'looking at viewer'], ['score_7', 'score_7'], ['score_9_up', 'score_9_up'], ['(score_9_up:1.2)', '(score_9_up:1.2)']])('%s → %s', (input, expected) => expect(normalizeTag(input, 'appearance')).toBe(expected));
  it.each(['artist_name', '@artist_name', '@@artist_name'])('artist %s', v => expect(normalizeTag(v, 'artist')).toBe('@artist name'));
  it('重み付きアーティストの括弧内に@を付ける', () => expect(normalizeTag('(artist_name:1.2)', 'artist')).toBe('(@artist name:1.2)'));
  it('重複排除と追加順', () => expect(parseTags('blue_eyes, long_hair\nblue eyes, BLUE EYES', 'appearance')).toEqual(['blue eyes', 'long hair']));
  it('重み・括弧内カンマ・エスケープ・引用文・交互構文を保持', () => expect(parseTags('(blue_eyes, long_hair:1.2), [red:blue:0.5], [a|b], name\\,suffix, "a, b"', 'appearance')).toEqual(['(blue eyes, long hair:1.2)', '[red:blue:0.5]', '[a|b]', 'name\\,suffix', '"a, b"']));
  it('不完全な括弧でも入力を失わない', () => expect(segments('a, (b,c').map(s => s.value)).toEqual(['a', ' (b,c']));
  it('LoRA・embedding・ワイルドカードの参照名を保持', () => expect(parseTags('<lora:my_model:0.8>, embedding:negative_style, __hair_color__, blue_eyes', 'other')).toEqual(['<lora:my_model:0.8>', 'embedding:negative_style', '__hair_color__', 'blue eyes']));
  it('タップで追加と削除', () => { expect(toggleTag('blue eyes', 'long_hair', 'appearance')).toBe('blue eyes, long hair'); expect(toggleTag('blue eyes, long hair', 'blue_eyes', 'appearance')).toBe('long hair'); });
});
describe('出力とドラフト', () => {
  it('固定順・空欄スキップ・ネガティブ独立', () => { const s = initialState(); s.draft.fields.background = 'sunset'; s.draft.fields.quality = 'score_9_up'; s.draft.fields.artist = 'abc_xyz'; s.draft.fields.negative = 'low_quality'; expect(outputs(s.draft.fields)).toEqual({ positive: 'score_9_up, @abc xyz, sunset', negative: 'low quality' }); });
  it('すべてのカテゴリの順序', () => { const s = initialState(); CATEGORIES.forEach(([id]) => s.draft.fields[id] = id); expect(outputs(s.draft.fields).positive).toBe('quality, count, character, series, @artist, appearance, outfit, pose, composition, background, other'); });
  it('折りたたみでも保持', () => { const s = seeded(); s.settings.open = []; expect(outputs(s.draft.fields).positive).toBe('blue eyes, very long hair'); });
  it('新規作成で初期値と履歴を保持', () => { const s = saved(); s.defaults.quality = 'custom'; const next = newDraft(s); expect(next.draft.fields.quality).toBe('custom'); expect(next.draft.memoId).toBeNull(); expect(next.history).toEqual(s.history); });
  it('初期サンプルは空・外見だけ開く', () => { const s = initialState(); expect(outputs(s.draft.fields).positive).toBe(''); expect(s.settings.open).toEqual(['appearance']); expect(s.history).toEqual([]); });
});
describe('作品とタグ履歴の整合性', () => {
  it('保存時だけ正規化した履歴を登録', () => { const s = seeded(); outputs(s.draft.fields); expect(s.history).toEqual([]); const next = saveMemo(s, false, time, 'work-1'); expect(next.history.map(h => h.tag)).toEqual(['blue eyes', 'very long hair', 'low quality']); expect(next.history.every(h => h.workIds.length === 1)).toBe(true); });
  it('上書き時に二重計上しない・作成日を保持', () => { const s = saved(); const next = saveMemo(s, false, '2026-11-06T10:00:00.000Z'); expect(next.memos).toHaveLength(1); expect(next.history[0].workIds).toEqual(['work-1']); expect(next.memos[0].createdAt).toBe(time); expect(next.memos[0].updatedAt).not.toBe(time); });
  it('複製は新IDで使用数を増やす', () => { const s = saved(); const next = saveMemo(s, true, '2026-11-06T10:00:00.000Z', 'work-2'); expect(next.memos).toHaveLength(2); expect(next.history[0].workIds).toEqual(['work-1', 'work-2']); expect(next.memos[0].createdAt).not.toBe(time); });
  it('タグ削除はメモに影響せず旧メモ上書きで復活しない', () => { const s = saved(); const snapshot = structuredClone(s.memos); s.history = s.history.filter(t => t.tag !== 'blue eyes'); const next = saveMemo(s); expect(next.history.some(t => t.tag === 'blue eyes')).toBe(false); expect(s.memos).toEqual(snapshot); });
  it('新作品の保存で削除済みタグを再登録', () => { const s = saved(); s.history = []; const next = saveMemo(s, true, time, 'work-2'); expect(next.history).toHaveLength(3); expect(next.history[0].workIds).toEqual(['work-2']); });
  it('上書きで外したタグの使用数を減らす', () => { const s = saved(); s.draft.fields.appearance = 'blue eyes'; const next = saveMemo(s); expect(next.history.find(t => t.tag === 'very long hair')!.workIds).toEqual([]); });
  it('作品削除後も学習タグを保持し使用数は減らす', () => { const next = deleteMemo(saved(), 'work-1'); expect(next.memos).toHaveLength(0); expect(next.history).toHaveLength(3); expect(next.history[0].workIds).toEqual([]); expect(next.draft.memoId).toBeNull(); });
  it('保存済み出力スナップショットは独立', () => { const s = saved(); s.draft.fields.appearance = 'green eyes'; s.defaults.appearance = 'red eyes'; expect(s.memos[0].positive).toBe('blue eyes, very long hair'); expect(s.memos[0].fields.appearance).toBe('blue eyes, very long hair'); });
  it('URL・自由メモにタグ変換しない', () => { const s = seeded(); s.draft.url = 'https://example.com/a_b'; s.draft.note = 'my_note'; const next = saveMemo(s); expect(next.memos[0].url).toBe(s.draft.url); expect(next.memos[0].note).toBe('my_note'); });
  it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///etc/a', 'not a url'])('危険/不正URL %s を拒否', url => { expect(safeUrl(url)).toBeNull(); const s = seeded(); s.draft.url = url; expect(() => saveMemo(s)).toThrow(); });
  it('http/httpsのみ許可', () => { expect(safeUrl('https://example.com')).toBeTruthy(); expect(safeUrl('http://example.com')).toBeTruthy(); });
  it('全体読み込み', () => { const s = saved(); const memo = s.memos[0]; const next = loadMemo(newDraft(s), memo); expect(next.draft.fields).toEqual(memo.fields); expect(next.draft.memoId).toBe(memo.id); });
  it('カテゴリ別読み込みは対象外とメタ情報を維持', () => { const s = saved(); s.draft.fields.outfit = 'dress'; s.draft.fields.appearance = 'changed'; s.draft.title = 'current title'; const next = loadMemo(s, s.memos[0], ['appearance']); expect(next.draft.fields.outfit).toBe('dress'); expect(next.draft.fields.appearance).toBe('blue eyes, very long hair'); expect(next.draft.title).toBe('current title'); });
});
describe('履歴検索と補完', () => {
  it('カテゴリ別・横断検索', () => { const s = saved(); expect(searchHistory(s.history, 'negative')).toHaveLength(1); expect(searchHistory(s.history, 'appearance', 'low', true)).toHaveLength(1); });
  it('カテゴリ・お気に入りを優先', () => { const s = saved(); s.history[1].favorite = true; expect(searchHistory(s.history, 'appearance', '', true)[0].tag).toBe('very long hair'); expect(searchHistory(s.history, 'negative', '', true)[0].tag).toBe('low quality'); });
  it('部分一致とアンダースコアで補完', () => { const s = saved(); expect(suggestions(s.history, 'appearance', 'very_l', 6)[0].tag).toBe('very long hair'); expect(suggestions(s.history, 'appearance', 'zzzz', 4)).toEqual([]); });
  it('カーソル位置のタグだけを置換', () => expect(completeTag('foo, very l, bar', 11, 'very long hair', 'appearance').text).toBe('foo, very long hair, bar'));
  it('補完で重複を増やさない', () => { const next = completeTag('blue eyes, bl, bar', 12, 'blue eyes', 'appearance'); expect(parseTags(next.text, 'appearance')).toEqual(['blue eyes', 'bar']); });
  it('別カテゴリのタグも現在カテゴリへ正規化', () => expect(completeTag('ar', 2, 'artist_name', 'artist').text).toBe('@artist name'));
});
describe('作品検索', () => {
  it('タイトル・メモ・プロンプト・お気に入り', () => { const s = saved(); expect(searchMemos(s.memos, { ...filter, query: '庭', field: 'title' })).toHaveLength(1); expect(searchMemos(s.memos, { ...filter, query: '窓辺', field: 'note' })).toHaveLength(1); expect(searchMemos(s.memos, { ...filter, query: 'BLUE EYES', field: 'prompt' })).toHaveLength(1); expect(searchMemos(s.memos, { ...filter, favorite: true })).toHaveLength(0); });
  it('日付両端を含む・片側のみ・条件併用', () => { const s = saved(); expect(searchMemos(s.memos, { ...filter, start: '2026-11-05', end: '2026-11-05', query: '庭' })).toHaveLength(1); expect(searchMemos(s.memos, { ...filter, start: '2026-11-06' })).toHaveLength(0); expect(searchMemos(s.memos, { ...filter, end: '2026-11-04' })).toHaveLength(0); });
  it('更新日ではなく作成日', () => { const s = saveMemo(saved(), false, '2026-11-20T10:00:00.000Z'); expect(searchMemos(s.memos, { ...filter, end: '2026-11-05' })).toHaveLength(1); });
  it('新しい順と古い順', () => { const s = saveMemo(saved(), true, '2026-11-06T10:00:00.000Z', 'work-2'); expect(searchMemos(s.memos, filter)[0].id).toBe('work-2'); expect(searchMemos(s.memos, { ...filter, oldest: true })[0].id).toBe('work-1'); });
});
describe('永続化とバックアップ', () => {
  function memory() { const map = new Map<string, string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } }; }
  it('入力途中・開閉・お気に入り・初期値・テーマを再読込', () => { const s = seeded(); s.draft.fields.other = 'unfinished ('; s.settings.theme = 'dark'; s.settings.open = ['other']; s.defaults.quality = 'my quality'; const storage = memory(); expect(persistState(storage, s)).toBeNull(); expect(loadState(storage).state).toEqual(s); expect(loadState(storage).state.history).toEqual([]); });
  it('完全往復でスナップショットと履歴を保持', () => { const s = saved(); s.history[0].favorite = true; expect(importBackup(exportBackup(s))).toEqual(s); });
  it.each(['{', '{}', '{"schemaVersion":99}', 'null', '[]'])('不正JSON %s を拒否', v => expect(() => importBackup(v)).toThrow());
  it('不正なカテゴリや投稿URLを拒否', () => { const s = saved(); const bad = JSON.parse(exportBackup(s)); bad.memos[0].url = 'javascript:alert(1)'; expect(() => importBackup(JSON.stringify(bad))).toThrow(); bad.memos[0].url = ''; bad.history[0].category = '__proto__'; expect(() => importBackup(JSON.stringify(bad))).toThrow(); });
  it('重複IDと参照破損を拒否', () => { const s = saved(); s.memos.push(s.memos[0]); expect(() => importBackup(exportBackup(s))).toThrow(); const t = saved(); t.history[0].workIds.push('missing'); expect(() => importBackup(exportBackup(t))).toThrow(); });
  it('履歴削除後の復元で再集計しない', () => { const s = saved(); s.history = []; expect(importBackup(exportBackup(s)).history).toEqual([]); });
  it('容量超過を通知', () => { expect(persistState({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } }, initialState())).toContain('保存に失敗'); });
  it('破損元データを上書きしない', () => { const storage = memory(); storage.setItem(STORAGE_KEY, '{broken'); expect(loadState(storage).error).toBeTruthy(); expect(storage.getItem(STORAGE_KEY)).toBe('{broken'); });
  it('Illustrious版のキーを操作しない', () => { const storage = memory(); storage.setItem('illustrious-data', 'untouched'); persistState(storage, seeded()); expect(storage.getItem('illustrious-data')).toBe('untouched'); });
});
