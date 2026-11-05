import { test, expect, type Page } from '@playwright/test';
import { initialState, saveMemo } from '../src/domain';
const key = 'anima-prompt-tool:v1';
async function data(page: Page) { return page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), key); }
async function save(page: Page, title: string) {
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByLabel('タイトル', { exact: true }).fill(title);
  await page.getByRole('button', { name: '作品を保存', exact: true }).click();
}
test.beforeEach(async ({ page }) => { await page.goto('./'); page.on('dialog', d => d.accept()); });
test('カテゴリ編集・コピー・保存・再読込・補完・タグ連続操作', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByLabel('外見のタグ', { exact: true }).fill('blue_eyes, very_long_hair, blue eyes');
  await page.getByRole('button', { name: /01 品質・メタ/ }).click();
  await page.getByLabel('品質・メタのタグ', { exact: true }).fill('score_9_up');
  await page.getByRole('button', { name: /12 ネガティブ/ }).click();
  await page.getByLabel('ネガティブのタグ', { exact: true }).fill('low_quality');
  expect((await data(page)).history).toEqual([]);
  await page.getByRole('button', { name: '出力', exact: true }).click();
  await expect(page.getByLabel('ポジティブの最終出力', { exact: true })).toHaveValue('score_9_up, blue eyes, very long hair');
  await expect(page.getByLabel('ネガティブの最終出力', { exact: true })).toHaveValue('low quality');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('dialog').getByRole('button', { name: 'コピー', exact: true }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('score_9_up, blue eyes, very long hair');
  expect((await data(page)).history).toEqual([]);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await save(page, '青い庭');
  expect((await data(page)).memos).toHaveLength(1);
  expect((await data(page)).history).toHaveLength(4);
  await page.reload();
  await expect(page.getByLabel('外見のタグ', { exact: true })).toHaveValue('blue eyes, very long hair');
  await page.getByLabel('外見のタグ', { exact: true }).fill('foo, very l, bar');
  await page.getByLabel('外見のタグ', { exact: true }).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(11, 11));
  await page.getByLabel('外見のタグ', { exact: true }).press('ArrowLeft');
  await page.getByRole('option', { name: /very long hair/ }).click();
  await expect(page.getByLabel('外見のタグ', { exact: true })).toHaveValue('foo, very long hair, bar');
  await page.locator('#body-appearance').getByRole('button', { name: 'blue eyes', exact: true }).click();
  await expect(page.getByLabel('外見のタグ', { exact: true })).toHaveValue('foo, very long hair, bar, blue eyes');
  await page.locator('#body-appearance').getByRole('button', { name: 'blue eyes', exact: true }).click();
  await expect(page.getByLabel('外見のタグ', { exact: true })).toHaveValue('foo, very long hair, bar');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '上書き保存', exact: true }).click();
  const current = await data(page); expect(current.memos).toHaveLength(1); expect(current.history.find((h: { tag: string }) => h.tag === 'very long hair').workIds).toHaveLength(1);
  expect(errors).toEqual([]);
});
test('作品検索・詳細・複製・部分読込・投稿URL', async ({ page }) => {
  await page.getByLabel('外見のタグ', { exact: true }).fill('jitome');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByLabel('タイトル', { exact: true }).fill('テスト作品');
  await page.getByLabel(/投稿URL 任意/).fill('https://example.com/a_b');
  await page.getByLabel(/自由メモ 任意/).fill('自然光のテスト');
  await page.getByRole('button', { name: '作品を保存', exact: true }).click();
  await page.getByRole('button', { name: /作品メモ/ }).click();
  await page.getByLabel('作品メモを検索').fill('自然光');
  await page.getByRole('button', { name: /テスト作品.*作品を開く/ }).click();
  await expect(page.getByRole('link', { name: '投稿を開く' })).toHaveAttribute('href', 'https://example.com/a_b');
  await page.getByRole('button', { name: '複製して新規保存', exact: true }).click();
  expect((await data(page)).memos).toHaveLength(2);
  await page.getByRole('button', { name: 'カテゴリを選んで読み込む', exact: true }).click();
  await page.getByRole('checkbox', { name: '外見', exact: true }).check();
  await page.getByRole('button', { name: '選択カテゴリを置き換える' }).click();
  await expect(page.getByLabel('外見のタグ', { exact: true })).toHaveValue('jitome');
});
test('バックアップの確認復元・不正データ拒否・ダークテーマ', async ({ page }) => {
  await page.getByLabel('外見のタグ', { exact: true }).fill('green_eyes');
  await save(page, 'バックアップ作品');
  await page.getByRole('button', { name: '設定・バックアップ' }).click();
  await page.getByRole('button', { name: 'ダーク', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONを書き出す' }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toMatch(/^anima-backup-.*\.json$/);
  const savedData = await data(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  expect((await data(page)).memos).toHaveLength(1);
  const imported = { ...savedData, memos: savedData.memos.map((m: object) => ({ ...m, title: '復元された作品' })) };
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByText('バックアップで全データを置き換えます')).toBeVisible();
  expect((await data(page)).memos[0].title).toBe('バックアップ作品');
  await page.getByRole('button', { name: 'すべて置き換えて復元' }).click();
  expect((await data(page)).memos[0].title).toBe('復元された作品');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
test('PWAの配信パス・キャッシュ・オフライン再起動と編集保存', async ({ page, context, request }) => {
  const manifestResponse = await request.get('manifest.webmanifest'); expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json(); expect(manifest.name).toBe('Anima Prompt Tool'); expect(manifest.start_url).toBe('/anima-prompt-tool/'); expect(manifest.scope).toBe('/anima-prompt-tool/'); expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get('apple-touch-icon.png')).status()).toBe(200);
  expect((await request.get('sw.js')).status()).toBe(200);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('/anima-prompt-tool/sw.js');
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('heading', { name: 'ひとつずつ、イメージに。' })).toBeVisible();
  await page.getByLabel('外見のタグ', { exact: true }).fill('offline_tag');
  await save(page, 'オフライン作品');
  await page.reload(); expect((await data(page)).memos[0].positive).toBe('offline tag');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'コピー', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('offline tag');
  await page.getByRole('button', { name: /作品メモ/ }).click();
  await page.getByLabel('作品メモを検索').fill('オフライン');
  await expect(page.getByRole('button', { name: /オフライン作品.*作品を開く/ })).toBeVisible();
  await context.setOffline(false);
});
test('IME変換中に補完で入力を上書きしない', async ({ page }) => {
  const field = page.getByLabel('外見のタグ', { exact: true });
  await field.fill('jitome'); await save(page, '補完用');
  await field.fill('jit');
  await expect(page.getByRole('option', { name: /jitome/ })).toBeVisible();
  await field.dispatchEvent('compositionstart', { data: 'じ' });
  await expect(page.getByRole('listbox', { name: '入力補完候補' })).toHaveCount(0);
  await expect(field).toHaveValue('jit');
  await field.dispatchEvent('compositionend', { data: 'じ' });
  await expect(page.getByRole('option', { name: /jitome/ })).toBeVisible();
});
test('容量超過を通知し画面内のドラフトを維持する', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.getByLabel('外見のタグ', { exact: true }).fill('unsaved eyes');
  await expect(page.getByRole('alert')).toContainText('保存に失敗');
  await expect(page.getByLabel('外見のタグ', { exact: true })).toHaveValue('unsaved eyes');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONを退避', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/anima-backup/);
});
test('破損データを保護し自動保存で上書きしない', async ({ page }) => {
  await page.evaluate(k => localStorage.setItem(k, '{broken data'), key);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('自動保存を停止');
  await page.getByLabel('外見のタグ', { exact: true }).fill('new text');
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe('{broken data');
});
test('モバイル幅・長いタグ・ライトとダークのレイアウト', async ({ page }, testInfo) => {
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByLabel('外見のタグ', { exact: true }).fill('a'.repeat(120));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 1000 });
  await page.getByLabel('外見のタグ', { exact: true }).fill('');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-light.png`, fullPage: true });
  await page.getByRole('button', { name: '設定・バックアップ' }).click();
  await page.getByRole('button', { name: 'ダーク', exact: true }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-dark.png`, fullPage: true });
});

test('作品一覧の条件クリア・お気に入りと日付絞り込み', async ({ page }, testInfo) => {
  let sample = initialState();
  for (const [id, title, date, prompt] of [
    ['autumn', '秋の街角', '2026-10-21', '1girl, autumn, street'],
    ['moya', 'モヤ・基本立ち絵', '2026-11-02', '1girl, black hair, low twintails, jitome, sailor uniform'],
    ['blue', '青髪少女・夜景', '2026-11-04', '1girl, blue hair, very long hair, night, city lights'],
  ]) {
    sample.draft = { ...sample.draft, memoId: null, title, fields: { ...sample.draft.fields, other: prompt } };
    sample = saveMemo(sample, false, `${date}T12:00:00.000Z`, id);
  }
  await page.evaluate(({ key, sample }) => localStorage.setItem(key, JSON.stringify(sample)), { key, sample });
  await page.reload();
  await page.getByRole('button', { name: /作品メモ/ }).click();
  await expect(page.getByRole('heading', { name: '保存した作品' })).toBeVisible();
  await expect(page.locator('.memo-list-card')).toHaveCount(3);
  await expect(page.locator('.memo-list-card').first()).toContainText('青髪少女・夜景');
  await page.getByLabel('開始日', { exact: true }).fill('2026-11-01');
  await page.getByLabel('終了日', { exact: true }).fill('2026-11-02');
  await expect(page.locator('.memo-list-card')).toHaveCount(1);
  await expect(page.locator('.memo-list-card')).toContainText('モヤ・基本立ち絵');
  await page.getByRole('button', { name: '条件クリア' }).click();
  await page.getByLabel('作品の並び順').selectOption('old');
  await expect(page.locator('.memo-list-card').first()).toContainText('秋の街角');
  await page.getByRole('button', { name: '秋の街角 作品を開く' }).click();
  await page.getByRole('button', { name: 'お気に入り登録', exact: true }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: '詳細条件', exact: true }).click();
  await page.getByLabel('お気に入りのみ', { exact: true }).check();
  await expect(page.locator('.memo-list-card')).toHaveCount(1);
  await page.getByLabel('作品メモを検索').fill('一致しない語');
  await expect(page.locator('.memo-list-card')).toHaveCount(0);
  await page.getByRole('button', { name: '条件クリア' }).click();
  await expect(page.locator('.memo-list-card')).toHaveCount(3);
  await expect(page.getByLabel('作品メモを検索')).toHaveValue('');
  await expect(page.getByLabel('お気に入りのみ', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('作品の並び順')).toHaveValue('new');
  expect((await data(page)).memos.find((m: { id: string }) => m.id === 'autumn').favorite).toBe(true);
  await page.getByRole('button', { name: '詳細条件', exact: true }).click();
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const start = await page.getByLabel('開始日', { exact: true }).boundingBox();
    const end = await page.getByLabel('終了日', { exact: true }).boundingBox();
    expect(start!.y).toBe(end!.y);
  }
  await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 1000 });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-memos-light.png`, fullPage: true, scale: 'css' });
  await page.getByRole('button', { name: '設定・バックアップ' }).click();
  await page.getByRole('button', { name: 'ダーク', exact: true }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-memos-dark.png`, fullPage: true, scale: 'css' });
});
