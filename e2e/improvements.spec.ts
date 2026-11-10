import { test, expect } from '@playwright/test';
import { initialState, saveMemo } from '../src/domain';
const key = 'anima-prompt-tool:v1';
test.use({ hasTouch: true });

test('タグをタップで前後移動し、出力・保存・再読込が追従する', async ({ page }, info) => {
  await page.goto('./');
  const input = page.getByLabel('外見のタグ', { exact: true });
  await input.fill('blue_eyes, long_hair, BLUE EYES, braid');
  const category = page.locator('#body-appearance');
  await category.getByRole('button', { name: 'タグを並び替える', exact: true }).click();
  await expect(category.getByRole('button', { name: 'blue eyes を前へ移動', exact: true })).toBeDisabled();
  await category.getByRole('button', { name: 'blue eyes を後へ移動', exact: true }).tap();
  await category.getByRole('button', { name: 'braid を前へ移動', exact: true }).tap();
  await expect(input).toHaveValue('long hair, braid, blue eyes');
  await expect(category.getByRole('button', { name: 'blue eyes を後へ移動', exact: true })).toBeDisabled();
  await page.screenshot({ path: `test-results/${info.project.name}-tag-order.png`, fullPage: true });
  await category.getByRole('button', { name: '並び替えを完了' }).click();
  await page.getByRole('button', { name: '出力', exact: true }).click();
  await expect(page.getByLabel('ポジティブの最終出力', { exact: true })).toHaveValue('long hair, braid, blue eyes');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '作品を保存', exact: true }).click();
  const snapshot = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key);
  expect(snapshot.memos[0].positive).toBe('long hair, braid, blue eyes');
  expect(snapshot.memos[0].fields.appearance).toBe('long hair, braid, blue eyes');
  await page.reload(); await expect(input).toHaveValue('long hair, braid, blue eyes');
});

test('カードのリンク表示とURLなしフィルタ', async ({ page }, info) => {
  let s = initialState(); s.draft.title = '未登録'; s = saveMemo(s, false, '2026-11-10T00:00:00Z', 'empty');
  s.draft.title = '登録済'; s.draft.url = 'https://example.com'; s = saveMemo(s, true, '2026-11-10T01:00:00Z', 'linked');
  await page.addInitScript(({ key, s }) => localStorage.setItem(key, JSON.stringify(s)), { key, s });
  await page.goto('./'); await page.getByRole('button', { name: /作品メモ/ }).click();
  const linked = page.getByRole('button', { name: '登録済 作品を開く', exact: true });
  await expect(linked.getByText('リンクあり')).toBeVisible();
  await expect(page.getByRole('button', { name: '未登録 作品を開く', exact: true }).getByText('リンクあり')).toHaveCount(0);
  await page.getByRole('button', { name: '詳細条件', exact: true }).click();
  await page.getByLabel('URLなしのみ', { exact: true }).check();
  await expect(linked).toHaveCount(0);
  await expect(page.getByRole('button', { name: '未登録 作品を開く', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-url-filter.png`, fullPage: true });
  await page.getByRole('button', { name: '条件クリア' }).click(); await expect(linked).toBeVisible();
});

test('従来データの読込と書き出し日時の記録・再読込', async ({ page }, info) => {
  await page.goto('./');
  await page.getByRole('button', { name: '設定・バックアップ' }).click();
  await expect(page.getByText('最終書き出し：未実施', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click();
  const download = await downloadPromise;
  const s = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key);
  expect(Number.isFinite(Date.parse(s.settings.lastBackupAt))).toBe(true);
  await expect(page.locator('.backup-status time')).toHaveAttribute('datetime', s.settings.lastBackupAt);
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString()).settings.lastBackupAt).toBe(s.settings.lastBackupAt);
  await page.screenshot({ path: `test-results/${info.project.name}-backup-time.png`, fullPage: true });
  await page.reload(); await page.getByRole('button', { name: '設定・バックアップ' }).click();
  await expect(page.locator('.backup-status time')).toHaveAttribute('datetime', s.settings.lastBackupAt);
  await expect(page.getByText('Anima Prompt Tool · v1.2.0', { exact: true })).toBeVisible();
});
