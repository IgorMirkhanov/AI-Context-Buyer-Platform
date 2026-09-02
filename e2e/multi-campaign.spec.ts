import { expect, test, type Locator, type Page } from "@playwright/test";
import { fillCreateForm } from "./create-project";

test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const ownerEmail = `owner.dual.${stamp}@e2e.local`;
const password = "E2ePassw0rd!";
const orgName = `E2E Dual Agency ${stamp}`;
const projectName = `E2E Dual ${stamp}`;

async function openProjectTab(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Разделы проекта" })
    .getByRole("link", { name: label, exact: true })
    .click();
}

function recSection(page: Page): Locator {
  return page.getByRole("heading", { name: "Рекомендации" }).locator("..");
}

function recommendationItems(page: Page, recs: Locator): Locator {
  return recs.locator("li").filter({
    has: page.getByRole("button", { name: "Принять", exact: true }),
  });
}

function reportSection(page: Page): Locator {
  return page.getByRole("heading", { name: "Отчёт" }).locator("..");
}

function campaignsBreakdownTable(page: Page): Locator {
  return page.locator("table").filter({
    has: page.locator("caption", { hasText: "Кампании" }),
  });
}

function extractCabinetIds(items: string[]): string[] {
  return items
    .map((line) => line.match(/ID в кабинете:\s*(\S+)/)?.[1])
    .filter((id): id is string => Boolean(id));
}

function extractRecCampaignIds(metaLines: string[]): string[] {
  return metaLines
    .map((line) => line.match(/кампания\s+(\S+)/i)?.[1])
    .filter((id): id is string => Boolean(id));
}

test.describe("План из 2 кампаний → publish → аналитика и рекомендации", () => {
  let page: Page;
  let planCampaignNames: string[] = [];
  let publishedExternalIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("регистрация, OAuth и пайплайн до утверждённого плана (2 кампании)", async () => {
    await page.goto("/register");
    await page.getByPlaceholder("Название организации").fill(orgName);
    await page.getByPlaceholder("Email").fill(ownerEmail);
    await page.getByPlaceholder("Пароль (минимум 8 символов)").fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page).toHaveURL(/\/projects$/);

    await fillCreateForm(page, projectName, {
      usp: "asus\nноутбуки москва",
      audience: "офисные закупки",
    });
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    await page.getByRole("button", { name: "Подключить Яндекс Директ" }).click();
    await expect(page).toHaveURL(/oauth=connected/, { timeout: 30_000 });

    const pipelineBtn = page.getByRole("button", {
      name: "Прогнать пайплайн до черновика",
    });
    await expect(pipelineBtn).toBeEnabled({ timeout: 15_000 });
    await pipelineBtn.click();
    await expect(page.getByText("Черновик готов — проверьте и опубликуйте")).toBeVisible({
      timeout: 300_000,
    });

    await openProjectTab(page, "План");
    const brandName = `${projectName} — Бренд`;
    const geoName = `${projectName} — Гео`;
    await expect(page.getByText(brandName, { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(geoName, { exact: true })).toBeVisible();
    planCampaignNames = [brandName, geoName];

    await openProjectTab(page, "Кампания");
    for (const name of planCampaignNames) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test("publish обеих кампаний из черновика", async () => {
    await openProjectTab(page, "Кампания");
    await page.getByLabel(/Создать кампанию в Яндекс Директ на паузе/).check();
    await page.getByRole("button", { name: "Запустить кампанию" }).click();

    const published = page.locator("li").filter({ hasText: "ID в кабинете:" });
    await expect(published).toHaveCount(2, { timeout: 60_000 });
    publishedExternalIds = extractCabinetIds(await published.allTextContents());
    expect(new Set(publishedExternalIds).size).toBe(2);
  });

  test("«Аналитика»: ровно 2 строки кампаний с именами из плана", async () => {
    await openProjectTab(page, "Аналитика");
    await page.getByRole("button", { name: "Обновить статистику" }).click();

    const report = reportSection(page);
    await expect(
      report.locator("p.text-xs", { hasText: "Показы" }),
    ).toBeVisible({ timeout: 30_000 });

    const rows = campaignsBreakdownTable(page).locator("tbody tr");
    await expect(rows).toHaveCount(2);
    const analyticsNames = await rows.locator("button").allTextContents();
    expect(new Set(analyticsNames).size).toBe(2);
    for (const name of planCampaignNames) {
      expect(analyticsNames).toContain(name);
    }
  });

  test("«Рекомендации»: optimization по обеим опубликованным кампаниям", async () => {
    await openProjectTab(page, "Рекомендации");
    await page.getByRole("button", { name: "Построить рекомендации" }).click();
    await expect(page.getByRole("button", { name: "Считаем…" })).toBeHidden({
      timeout: 30_000,
    });

    const recs = recSection(page);
    const items = recommendationItems(page, recs);
    await expect(items.first()).toBeVisible({ timeout: 30_000 });

    const metaLines = await items.locator("p.text-xs").allTextContents();
    const recCampaignIds = new Set(extractRecCampaignIds(metaLines));
    expect(recCampaignIds.size).toBeGreaterThanOrEqual(2);
    for (const externalId of publishedExternalIds) {
      expect(recCampaignIds.has(externalId)).toBe(true);
    }
  });
});
