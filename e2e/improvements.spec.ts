import { test, expect, type Page } from '@playwright/test';
import { initialState, saveMemo } from '../src/domain';
const key = 'anima-prompt-tool:v1';
test.use({ hasTouch: true });

async function dragTag(page: Page, from: string, to: string, touch: boolean, cancel = false, screenshot?: string) {
  const chip = page.locator('#body-appearance .sortable-tags').getByRole('button', { name: from + ' を削除', exact: true });
  const target = page.locator('#body-appearance .sortable-tags').getByRole('button', { name: to + ' を削除', exact: true });
  await chip.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  const a = (await chip.boundingBox())!; const b = (await target.boundingBox())!;
  const first = { x: a.x + a.width / 2, y: a.y + a.height / 2 }; const last = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await expect(page.locator('.tag-drag-overlay')).toBeVisible();
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: first.x + (last.x-first.x)*step/10, y: first.y + (last.y-first.y)*step/10 }] });
    }
    if (screenshot) await page.screenshot({ path: screenshot, scale: 'css' });
    await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(first.x, first.y); await page.mouse.down();
    await page.mouse.move(last.x, last.y, { steps: 15 });
    await expect(page.locator('.tag-drag-overlay')).toBeVisible();
    if (screenshot) await page.screenshot({ path: screenshot, scale: 'css' });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  await expect(page.locator('.tag-drag-overlay')).toHaveCount(0);
}

test('タグチップを直接ドラッグし、出力・保存・再読込が追従する', async ({ page }, info) => {
  await page.goto('./');
  const input = page.getByLabel('外見のタグ', { exact: true });
  await input.fill('blue_eyes, long_hair, BLUE EYES, braid');
  await expect(page.getByRole('button', { name: 'タグを並び替える', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /を前へ移動|を後へ移動/ })).toHaveCount(0);
  await dragTag(page, 'blue eyes', 'braid', info.project.name === 'mobile', false, `test-results/${info.project.name}-tag-drag.png`);
  await expect(input).toHaveValue('long hair, braid, blue eyes');
  await expect(page.locator('#body-appearance .sortable-tags button')).toHaveCount(3);
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

test('折り返した行へ移動・キャンセル・通常タップ削除', async ({ page }, info) => {
  await page.goto('./'); await page.setViewportSize({ width: 390, height: 844 });
  const input = page.getByLabel('外見のタグ', { exact: true });
  await input.fill('blue_eyes, very_long_hair, black_ribbon, single_braid, hair_ornament');
  await dragTag(page, 'blue eyes', 'hair ornament', info.project.name === 'mobile', true);
  await expect(input).toHaveValue('blue_eyes, very_long_hair, black_ribbon, single_braid, hair_ornament');
  await dragTag(page, 'hair ornament', 'blue eyes', info.project.name === 'mobile');
  await expect(input).toHaveValue('hair ornament, blue eyes, very long hair, black ribbon, single braid');
  await page.waitForTimeout(450);
  await page.locator('#body-appearance .sortable-tags').getByRole('button', { name: 'blue eyes を削除', exact: true }).tap();
  await expect(input).toHaveValue('hair ornament, very long hair, black ribbon, single braid');
  await input.fill('only_tag');
  await page.locator('#body-appearance .sortable-tags').getByRole('button', { name: 'only tag を削除', exact: true }).tap();
  await expect(input).toHaveValue('');
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
  await expect(page.getByText('Anima Prompt Tool · v1.3.1', { exact: true })).toBeVisible();
});


test('長押し前のスワイプはスクロール、ドラッグ中は画面端で自動スクロール', async ({ page }) => {
  await page.goto('./'); await page.setViewportSize({ width: 390, height: 844 });
  const input = page.getByLabel('外見のタグ', { exact: true });
  const value = Array.from({ length: 45 }, (_, i) => 'tag ' + i).join(', ');
  await input.fill(value);
  const chip = page.locator('#body-appearance .sortable-tags button').first();
  await chip.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  const cdp = await page.context().newCDPSession(page);
  let a = (await chip.boundingBox())!; let point = { x: a.x + a.width/2, y: a.y + a.height/2 };
  const beforeSwipe = await page.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for(let step=1;step<=6;step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y-step*25 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeSwipe + 30);
  await expect(page.locator('.tag-drag-overlay')).toHaveCount(0); await expect(input).toHaveValue(value);
  await chip.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  a = (await chip.boundingBox())!; point = { x: a.x+a.width/2, y: a.y+a.height/2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect(page.locator('.tag-drag-overlay')).toBeVisible();
  const beforeAuto = await page.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: 820 }] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeAuto + 80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(input).toHaveValue(value); await cdp.detach();
});
