import { useEffect, useState } from 'react';
import { Pencil, Save } from 'lucide-react';
import type { Memo, MemoDetails } from './domain';

export default function MemoDetailsEditor({ memo, onSave, onDirtyChange }: {
  memo: Memo;
  onSave: (details: MemoDetails) => string | null;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<MemoDetails>({ title: memo.title, url: memo.url, note: memo.note });
  const [error, setError] = useState('');
  const dirty = editing && (values.title !== memo.title || values.url !== memo.url || values.note !== memo.note);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  if (!editing) return <button className="text-button memo-edit-details" onClick={() => { setValues({ title: memo.title, url: memo.url, note: memo.note }); setError(''); setEditing(true); }}><Pencil size={15} />タイトル・URL・コメントを編集</button>;
  return <form className="memo-details-editor" onSubmit={e => {
    e.preventDefault(); const message = onSave(values);
    if (message) setError(message); else { setEditing(false); onDirtyChange(false); }
  }}>
    <h3>作品情報を編集</h3>
    <label className="field-label">タイトル<input maxLength={2000} value={values.title} placeholder="無題の作品" onChange={e => setValues({ ...values, title: e.target.value })} /></label>
    <label className="field-label">投稿URL<input type="url" maxLength={2000} value={values.url} placeholder="https://…" onChange={e => setValues({ ...values, url: e.target.value })} /></label>
    <label className="field-label">コメント（自由メモ）<textarea aria-label="コメント（自由メモ）" rows={4} maxLength={200000} value={values.note} placeholder="モデル、生成設定、作品の覚え書き…" onChange={e => setValues({ ...values, note: e.target.value })} /></label>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="button-row"><button type="button" className="secondary" onClick={() => { if (!dirty || confirm('作品情報の未保存の変更を破棄しますか？')) { setEditing(false); onDirtyChange(false); } }}>キャンセル</button><button type="submit" className="primary"><Save size={16} />作品情報を保存</button></div>
  </form>;
}
