import { describe, it, expect } from 'vitest';
import { initialState, reorderTag, outputs, parseTags, saveMemo, searchMemos, type Category } from './domain';
import { exportBackup, importBackup } from './storage';
import { EMPTY_MEMO_FILTER } from './MemoCollection';

describe('タグ順の変更', () => {
  it.each<[Category, string]>([
    ['appearance', 'blue_eyes, (long_hair, braid:1.2), BLUE EYES, name\\,suffix'],
    ['artist', 'artist_one, @artist_two, @@artist_one'],
    ['quality', 'score_9_up, highres, __quality_tag__'],
    ['negative', 'low_quality, bad_hands, LOW QUALITY'],
  ])('%s の正規化・重複排除と内容を保持する', (category, source) => {
    const tags = parseTags(source, category);
    const moved = reorderTag(source, category, 0, 1);
    const expected = [...tags]; [expected[0], expected[1]] = [expected[1], expected[0]];
    expect(parseTags(moved, category)).toEqual(expected);
    const state = initialState(); state.draft.fields[category] = moved;
    expect(outputs(state.draft.fields)[category === 'negative' ? 'negative' : 'positive']).toBe(expected.join(', '));
    expect(reorderTag(moved, category, 1, 0)).toBe(tags.join(', '));
  });
  it('離れた位置への移動でも間のタグ順を保つ', () => {
    expect(reorderTag('a, b, c, d', 'other', 0, 3)).toBe('b, c, d, a');
    expect(reorderTag('a, b, c, d', 'other', 3, 0)).toBe('d, a, b, c');
    expect(reorderTag('blue_eyes, blue eyes', 'appearance', 0, 0)).toBe('blue_eyes, blue eyes');
  });
  it('端・空欄・不正位置は生テキストのまま保持', () => {
    for (const [source, index, direction] of [['a, b', 0, -1], ['a, b', 1, 2], ['', 0, 1], ['a', -1, 1], ['a', 0.5, 1]] as const)
      expect(reorderTag(source, 'appearance', index, direction)).toBe(source);
  });
  it('未完の括弧を動かして別のタグを巻き込む場合は拒否', () => {
    expect(() => reorderTag('blue eyes, (long hair, braid', 'appearance', 1, 0)).toThrow('括弧');
  });
});

describe('URLなしのみ', () => {
  it('他の検索条件と組み合わせられ、フィルタ解除もできる', () => {
    let s = initialState(); s.draft.title = '記録A'; s = saveMemo(s, false, '2026-11-10T00:00:00Z', 'a');
    s.draft.url = 'https://example.com'; s.draft.title = '記録B'; s = saveMemo(s, true, '2026-11-10T01:00:00Z', 'b');
    expect(searchMemos(s.memos, { ...EMPTY_MEMO_FILTER, withoutUrl: true }).map(m => m.id)).toEqual(['a']);
    expect(searchMemos(s.memos, { ...EMPTY_MEMO_FILTER, withoutUrl: true, query: 'B' })).toEqual([]);
    expect(searchMemos(s.memos, { ...EMPTY_MEMO_FILTER, withoutUrl: true, favorite: true })).toEqual([]);
    expect(searchMemos(s.memos, EMPTY_MEMO_FILTER)).toHaveLength(2);
  });
});

describe('バックアップ日時の互換性', () => {
  it('日時項目がない従来形式も復元できる', () => {
    const legacy = initialState(); delete legacy.settings.lastBackupAt;
    expect(importBackup(exportBackup(legacy))).toEqual(legacy);
  });
  it('日時を含むJSONを往復でき、不正日時は拒否', () => {
    const s = initialState(); s.settings.lastBackupAt = '2026-11-10T02:34:56.789Z';
    expect(importBackup(exportBackup(s))).toEqual(s);
    expect(() => importBackup(exportBackup({ ...s, settings: { ...s.settings, lastBackupAt: 'yesterday' } }))).toThrow();
  });
});
