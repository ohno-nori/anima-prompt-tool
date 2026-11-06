import { useRef, useState } from 'react';
import { FileUp, Import } from 'lucide-react';
import { CATEGORIES, parseTags, type Fields } from './domain';
import { MAX_YAML_BYTES, YAML_EXAMPLE, parsePromptYaml, type ImportedFields, type ImportMode } from './yamlImport';

export default function YamlImportPanel({ fields, onImport }: {
  fields: Fields;
  onImport: (values: ImportedFields, mode: ImportMode) => string | null;
}) {
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<ImportedFields | null>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const readVersion = useRef(0);
  function changeSource(text: string) { readVersion.current++; setSource(text); setPreview(null); setError(''); setFileName(''); setLoading(false); }
  async function readFile(file?: File) {
    if (!file) return;
    const version = ++readVersion.current;
    setPreview(null); setError(''); setLoading(true);
    try {
      if (file.size > MAX_YAML_BYTES) throw new Error('YAMLは1MB以下にしてください。');
      const text = await file.text();
      if (version !== readVersion.current) return;
      setSource(text); setFileName(file.name);
    } catch (e) { if (version === readVersion.current) setError((e as Error).message); }
    finally { if (version === readVersion.current) setLoading(false); }
  }
  return <div className="yaml-import">
    <p className="muted">カテゴリIDをキーにしたYAMLを、編集中のプロンプトへ読み込みます。</p>
    <label className="secondary file-button yaml-file-button"><FileUp size={17} />YAMLファイルを選択<input aria-label="YAMLファイルを選択" type="file" accept=".yaml,.yml,text/yaml,application/yaml,text/plain" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
    {fileName && <p className="yaml-filename">{fileName}</p>}
    <label className="field-label"><span id="yaml-source-label">YAMLを貼り付け</span><textarea aria-labelledby="yaml-source-label" className="yaml-source" rows={9} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={source} maxLength={MAX_YAML_BYTES} placeholder={'appearance: "blue_eyes, long_hair"\nnegative: ""'} onChange={e => changeSource(e.target.value)} /></label>
    <details className="yaml-help"><summary>対応するカテゴリID・記入例</summary><p>値はカンマ区切りの文字列、またはタグのリストにできます。</p><pre>{YAML_EXAMPLE}</pre><div className="yaml-id-list">{CATEGORIES.map(([id, name]) => <span key={id}><code>{id}</code>：{name}</span>)}</div></details>
    <button className="secondary" disabled={loading} onClick={() => { try { setPreview(parsePromptYaml(source)); setError(''); } catch (e) { setPreview(null); setError((e as Error).message); } }}>{loading ? 'ファイルを読み込み中…' : '読み込み内容を確認'}</button>
    {error && <p className="error-text yaml-error" role="alert">{error}</p>}
    {preview && <section className="yaml-preview" aria-label="YAML読み込みプレビュー">
      <h3>{Object.keys(preview).length}カテゴリを読み込み</h3>
      <fieldset className="yaml-modes"><legend>反映方法</legend><label className="check-label"><input type="radio" name="yaml-mode" value="append" checked={mode === 'append'} onChange={() => setMode('append')} />現在の内容に追加</label><label className="check-label"><input type="radio" name="yaml-mode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />YAMLにあるカテゴリを置き換え</label></fieldset>
      <p className="muted">{mode === 'append' ? '既存のタグを残して末尾に追加します。同じタグと空欄は追加しません。' : '記載されたカテゴリを置き換えます。空文字のカテゴリは空になります。記載のないカテゴリは維持します。'}</p>
      <div className="yaml-preview-list">{CATEGORIES.filter(([id]) => Object.hasOwn(preview, id)).map(([id, name]) => <div className="yaml-preview-row" key={id}><h4>{name}<small>現在 {parseTags(fields[id], id).length} → 読み込み {parseTags(preview[id]!, id).length} タグ</small></h4><p>{preview[id] || (mode === 'replace' ? '空欄に置き換え' : '変更なし')}</p></div>)}</div>
      <p className="muted">タグ履歴は作品メモを保存したときに登録されます。</p>
      <button className="primary" onClick={() => { const message = onImport(preview, mode); if (message) setError(message); }}><Import size={16} />{mode === 'append' ? 'プロンプトに追加する' : '対象カテゴリを置き換える'}</button>
    </section>}
  </div>;
}
