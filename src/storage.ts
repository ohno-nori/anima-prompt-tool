import { initialState, validateState, type AppState } from './domain';
export const STORAGE_KEY = 'anima-prompt-tool:v1';
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
// Resolve localStorage inside the guarded operation: its getter itself can throw.
export const browserStorage: StorageLike = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
export function loadState(storage: StorageLike): { state: AppState; error: string | null } {
  try { const value = storage.getItem(STORAGE_KEY); return { state: value ? importBackup(value) : initialState(), error: null }; }
  catch { return { state: initialState(), error: '保存データを読み込めませんでした。元データを保護するため自動保存を停止しています。設定から元データを退避し、バックアップを復元してください。' }; }
}
export function persistState(storage: StorageLike, state: AppState): string | null {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return null; }
  catch { return '端末への保存に失敗しました。空き容量やブラウザの設定を確認し、JSONバックアップを保存してください。'; }
}
export function exportBackup(state: AppState): string { return JSON.stringify(state, null, 2); }
export function importBackup(value: string): AppState {
  if (new Blob([value]).size > MAX_BACKUP_BYTES) throw new Error('ファイルサイズが20MBを超えています。');
  try { return validateState(JSON.parse(value)); } catch { throw new Error('バックアップの形式が不正、または未対応のバージョンです。既存データは変更されません。'); }
}
export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(text); return; } catch { /* Older Safari fallback below. */ } }
  const input = document.createElement('textarea'); input.value = text; input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'; input.readOnly = true; document.body.append(input); input.select(); input.setSelectionRange(0, text.length);
  const copied = document.execCommand('copy'); input.remove(); if (!copied) throw new Error('コピーできませんでした。出力欄から選択してコピーしてください。');
}
