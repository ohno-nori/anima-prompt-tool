import { describe, expect, it } from 'vitest';
import { initialState, saveMemo, updateMemoDetails, newDraft } from './domain';
import { applyPromptImport, parsePromptYaml, MAX_YAML_BYTES } from './yamlImport';

function saved() {
  const state = initialState();
  state.draft.title = '保存した作品'; state.draft.fields.appearance = 'blue_eyes';
  return saveMemo(state, false, '2026-11-05T12:00:00.000Z', 'memo-1');
}
describe('作品情報の直接編集', () => {
  it('スナップショット・カテゴリ・履歴・作成日・お気に入りを保持', () => {
    const state = saved(); state.memos[0].positive = 'historical_snapshot'; state.memos[0].favorite = true;
    const before = structuredClone(state);
    const next = updateMemoDetails(state, 'memo-1', { title: '新タイトル', url: 'https://example.com/my_art', note: 'my_note' }, '2026-11-06T12:00:00.000Z');
    expect(next.memos[0]).toEqual({ ...before.memos[0], title: '新タイトル', url: 'https://example.com/my_art', note: 'my_note', updatedAt: '2026-11-06T12:00:00.000Z' });
    expect(next.history).toEqual(before.history); expect(state).toEqual(before);
  });
  it('同じ作品の編集中情報を同期し、未保存プロンプトを保持', () => {
    const state = saved(); state.draft.fields.appearance = 'unfinished (';
    const next = updateMemoDetails(state, 'memo-1', { title: '変更', url: '', note: 'コメント' });
    expect(next.draft.title).toBe('変更'); expect(next.draft.note).toBe('コメント'); expect(next.draft.fields.appearance).toBe('unfinished (');
    expect(next.memos[0].positive).toBe('blue eyes');
  });
  it('別のドラフトは変更しない', () => {
    const state = newDraft(saved()); state.draft.title = '別作品';
    expect(updateMemoDetails(state, 'memo-1', { title: '更新', url: '', note: '' }).draft).toEqual(state.draft);
  });
  it('URLを外せる・空タイトルは無題', () => {
    const next = updateMemoDetails(saved(), 'memo-1', { title: '  ', url: '', note: '' });
    expect(next.memos[0].title).toBe('無題の作品'); expect(next.memos[0].url).toBe('');
  });
  it.each(['javascript:alert(1)', 'file:///tmp/a', 'data:text/plain,a'])('危険なURL %s を拒否', url => {
    const state = saved(); const before = structuredClone(state);
    expect(() => updateMemoDetails(state, 'memo-1', { title: '変更', url, note: '' })).toThrow('http'); expect(state).toEqual(before);
  });
  it('削除された作品を復活させない', () => expect(() => updateMemoDetails(initialState(), 'missing', { title: '', url: '', note: '' })).toThrow('見つかりません'));
});
describe('内部IDのYAML読み込み', () => {
  it('提示された12カテゴリの形式を読み込む', () => {
    const yaml = `quality: "bad id, highres"
count: "1girl, solo"
character: "kitakami (kancolle)"
series: "kantai collection"
artist: ""
appearance: "black hair, blunt bangs, braid, hair over shoulder, long hair, sidelocks, single braid"
outfit: "black necktie, brown shoes, green sailor collar, green skirt"
pose: "holding, parted lips, standing"
composition: "full body"
background: "grey background, simple background"
other: ""
negative: ""`;
    const result = parsePromptYaml(yaml);
    expect(Object.keys(result)).toHaveLength(12); expect(result.character).toBe('kitakami (kancolle)'); expect(result.artist).toBe(''); expect(result.quality).toBe('bad id, highres');
  });
  it('改行・コメント・リスト・重複・score例外・artistに対応', () => {
    const result = parsePromptYaml('quality: "score_9_up" # comment\nartist: "artist_name, @artist_name"\nappearance:\n  - blue_eyes\n  - long_hair\n  - blue eyes\nother: |\n  soft light\n  quiet room');
    expect(result).toEqual({ quality: 'score_9_up', artist: '@artist name', appearance: 'blue eyes, long hair', other: 'soft light, quiet room' });
  });
  it('コードブロックごとの貼り付けに対応', () => expect(parsePromptYaml('```yaml\nappearance: "blue_eyes"\n```')).toEqual({ appearance: 'blue eyes' }));
  it.each(['appearance: null', 'count: 123', 'other: true', 'appearance: {nested: value}', 'appearance: [true]', '- appearance', '{}', '', 'unknown: "a"', '__proto__: "a"', 'appearance: "a"\nappearance: "b"', 'appearance: "unclosed', 'appearance: !custom a', 'appearance: &x blue\nother: *x', '---\nappearance: a\n---\nother: b'])('不正なYAMLを拒否: %s', yaml => expect(() => parsePromptYaml(yaml)).toThrow());
  it('サイズ上限を超える入力を拒否', () => expect(() => parsePromptYaml('a'.repeat(MAX_YAML_BYTES + 1))).toThrow('1MB'));
  it('追加は既存順を保ち、重複排除・空文字スキップ', () => {
    const state = saved(); state.draft.fields.artist = '@existing';
    const next = applyPromptImport(state, parsePromptYaml('appearance: "blue_eyes, long_hair"\nartist: ""'), 'append');
    expect(next.draft.fields.appearance).toBe('blue eyes, long hair'); expect(next.draft.fields.artist).toBe('@existing');
    expect(next.memos).toEqual(state.memos); expect(next.history).toEqual(state.history);
  });
  it('置換は明記したカテゴリだけ。空文字はクリアし、未指定は維持', () => {
    const state = saved(); state.draft.fields.outfit = 'dress'; state.draft.fields.negative = 'low quality';
    const next = applyPromptImport(state, parsePromptYaml('appearance: "green_eyes"\nnegative: ""'), 'replace');
    expect(next.draft.fields.appearance).toBe('green eyes'); expect(next.draft.fields.negative).toBe(''); expect(next.draft.fields.outfit).toBe('dress');
    expect(next.draft.memoId).toBe(state.draft.memoId); expect(next.history).toEqual(state.history); expect(next.memos).toEqual(state.memos);
  });
  it('長すぎる結合を拒否し、途中まで反映しない', () => {
    const state = initialState(); state.draft.fields.appearance = 'a'.repeat(200000);
    const before = structuredClone(state);
    expect(() => applyPromptImport(state, { quality: 'test', appearance: 'more' }, 'append')).toThrow(); expect(state).toEqual(before);
  });
});
