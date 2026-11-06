import { parseDocument } from 'yaml';
import { ids, parseTags, type AppState, type Category, type Fields } from './domain';

export const MAX_YAML_BYTES = 1024 * 1024;
export type ImportedFields = Partial<Fields>;
export type ImportMode = 'append' | 'replace';
export function parsePromptYaml(source: string): ImportedFields {
  if (new TextEncoder().encode(source).length > MAX_YAML_BYTES) throw new Error('YAMLは1MB以下にしてください。');
  const fenced = source.trim().match(/^```(?:yaml|yml)?\s*\n([\s\S]*?)\n```$/i);
  const input = fenced ? fenced[1] : source;
  if (!input.trim()) throw new Error('YAMLを貼り付けるか、ファイルを選択してください。');
  const doc = parseDocument(input, { version: '1.2', uniqueKeys: true, strict: true });
  if (doc.errors.length || doc.warnings.length) {
    const issue = doc.errors[0] ?? doc.warnings[0];
    throw new Error(`YAMLの形式を確認してください。${issue.linePos?.[0] ? `（${issue.linePos[0].line}行目）` : ''} ${issue.message}`);
  }
  let value: unknown;
  try { value = doc.toJS({ maxAliasCount: 0 }); } catch { throw new Error('YAMLの参照（エイリアス）は使用できません。各カテゴリにタグを直接記入してください。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('「appearance: "blue eyes"」のように、カテゴリIDとタグを記入してください。');
  const entries = Object.entries(value);
  if (!entries.length) throw new Error('読み込めるカテゴリがありません。');
  const result: ImportedFields = {};
  for (const [key, raw] of entries) {
    if (!ids.includes(key as Category)) throw new Error(`不明なカテゴリID「${key}」があります。対応するIDを確認してください。`);
    if (typeof raw !== 'string' && !(Array.isArray(raw) && raw.every(v => typeof v === 'string'))) throw new Error(`「${key}」には文字列または文字列のリストを指定してください。空欄にする場合は "" と記入します。`);
    const text = typeof raw === 'string' ? raw : raw.join(', ');
    if (text.length > 200000) throw new Error(`「${key}」の内容が長すぎます。20万文字以内にしてください。`);
    result[key as Category] = parseTags(text, key as Category).join(', ');
  }
  return result;
}

export function applyPromptImport(state: AppState, imported: ImportedFields, mode: ImportMode): AppState {
  const fields = { ...state.draft.fields };
  for (const id of ids) {
    if (!Object.hasOwn(imported, id)) continue;
    const value = imported[id]!;
    if (mode === 'replace') fields[id] = value;
    else if (value) fields[id] = parseTags([fields[id], value].filter(Boolean).join(', '), id).join(', ');
    if (fields[id].length > 200000) throw new Error(`「${id}」の読み込み後の内容が20万文字を超えます。`);
  }
  return { ...state, draft: { ...state.draft, fields } };
}

export const YAML_EXAMPLE = `quality: ""
count: "1girl, solo"
character: ""
series: ""
artist: ""
appearance: "blue_eyes, long_hair"
outfit: ""
pose: ""
composition: ""
background: ""
other: ""
negative: ""`;
