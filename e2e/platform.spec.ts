import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { fillCreateForm, projectLink } from "./create-project";

test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const ownerEmail = `owner.${stamp}@e2e.local`;
const clientEmail = `client.${stamp}@e2e.local`;
const password = "E2ePassw0rd!";
const clientPassword = "ClientPass1!";
const orgName = `E2E Agency ${stamp}`;
const projectName = `E2E Shop ${stamp}`;
const productName = `Кабинет ${stamp}`;
const slug = `e2e${stamp}`.slice(0, 20);

const SECRET_LEAKS = [
  "mock-yandex-access",
  "mock-yandex-refresh",
  "sk-",
  "Bearer ",
  "access_token",
  "YANDEX_CLIENT_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
];

function recSection(page: Page): Locator {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Рекомендации" }),
  });
}

async function openProjectTab(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Разделы проекта" })
    .getByRole("link", { name: label, exact: true })
    .click();
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `e2e/screenshots/${name}.png`,
    fullPage: true,
  });
}

async function assertNoSecretsInDom(page: Page): Promise<void> {
  const html = await page.content();
  for (const leak of SECRET_LEAKS) {
    expect(html, `DOM must not contain ${leak}`).not.toContain(leak);
  }
}

test.describe("Этапы 10–17: пользовательский путь (headless, моки)", () => {
  let page: Page;
  let browser: Browser;
  let projectId: string;

  test.beforeAll(async ({ browser: workerBrowser }) => {
    browser = workerBrowser;
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("0. регистрация без чекбокса терминов блокируется с понятной ошибкой", async () => {
    const guest = await browser.newPage();
    try {
      await guest.goto("/register");
      await guest.getByPlaceholder("Название организации").fill(`Blocked ${stamp}`);
      await guest
        .getByPlaceholder("Email")
        .fill(`blocked.${stamp}@e2e.local`);
      await guest
        .getByPlaceholder("Пароль (минимум 8 символов)")
        .fill(password);
      await expect(guest.getByRole("checkbox")).not.toBeChecked();
      await expect(
        guest.getByRole("button", { name: "Создать аккаунт" }),
      ).toBeDisabled();
      await expect(
        guest.getByText(/Принимаю.*условия использования/),
      ).toBeVisible();

      await guest.locator("form").evaluate((form: HTMLFormElement) => {
        const checkbox = form.querySelector("input[type=checkbox]");
        const button = form.querySelector("button[type=submit]");
        if (checkbox instanceof HTMLInputElement) {
          checkbox.required = false;
        }
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
          button.click();
        }
      });
      await expect(
        guest.getByText("Нужно принять условия использования"),
      ).toBeVisible();
      await expect(guest).toHaveURL(/\/register/);
    } finally {
      await guest.close();
    }
  });

  test("1. регистрация → проект → бриф → Яндекс (мок) → пайплайн до черновика", async () => {
    await page.goto("/register");
    await page.getByPlaceholder("Название организации").fill(orgName);
    await page.getByPlaceholder("Email").fill(ownerEmail);
    await page.getByPlaceholder("Пароль (минимум 8 символов)").fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "Мои проекты" })).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /Режим новичка/ }),
    ).toBeChecked();
    await shot(page, "after-portfolio");

    projectId = await fillCreateForm(page, projectName, {
      usp: "Быстрая поставка ноутбуков для офиса",
      audience: "IT-отделы компаний",
      negatives: "бесплатно, торрент",
    });
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    await page.getByRole("button", { name: "Подключить Яндекс Директ" }).click();
    await expect(page).toHaveURL(/oauth=connected/, { timeout: 30_000 });
    await expect(page.getByText("Яндекс Директ подключён.")).toBeVisible();
    await expect(page.getByText(/Подключено · mock-direct-login/)).toBeVisible();

    const pipelineBtn = page.getByRole("button", {
      name: "Прогнать пайплайн до черновика",
    });
    await expect(pipelineBtn).toBeEnabled({ timeout: 15_000 });
    await pipelineBtn.click();
    await expect(page.getByText("Черновик готов — проверьте и опубликуйте")).toBeVisible({
      timeout: 300_000,
    });

    await openProjectTab(page, "Кампания");
    await expect(
      page.locator("section").filter({
        has: page.getByRole("heading", { name: "Кампания" }),
      }),
    ).toContainText("Черновик:");
    await expect(
      page.getByRole("button", { name: "Запустить кампанию" }),
    ).toBeVisible();
    await shot(page, "after-campaign-draft");
  });

  test("1b. бейджи объяснимости и метрика quality после пайплайна", async () => {
    await openProjectTab(page, "Объявления");
    const ads = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Объявления" }),
    });
    await expect(
      ads.getByText(/принято без правок: объявления \d+%, кластеры \d+%/),
    ).toBeVisible();
    await expect(ads.getByRole("heading", { name: "По кластерам" })).toBeVisible();
    await expect(ads.getByText("#1").first()).toBeVisible();

    const firstInput = ads.getByRole("textbox", { name: "Заголовок 1" }).first();
    const current = await firstInput.inputValue();
    await firstInput.fill(`${current} правка`);
    await firstInput.blur();
    await expect(firstInput).toHaveValue(`${current} правка`);
    await expect(
      ads.getByText(/принято без правок: объявления \d+%, кластеры \d+%/),
    ).toBeVisible();
  });

  test("2. черновик → подтверждение → Запустить → кампания paused", async () => {
    await openProjectTab(page, "Кампания");
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(
      page.getByText("Что произойдёт при нажатии «Запустить»"),
    ).toBeVisible();
    await expect(
      page.getByText(/в статусе «на паузе»/),
    ).toBeVisible();
    await page.getByLabel(/Создать кампанию в Яндекс Директ на паузе/).check();
    await page.getByRole("button", { name: "Запустить кампанию" }).click();
    await expect(page.getByText(/ID в кабинете:.*paused/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("3. Обновить статистику → KPI и текстовая сводка", async () => {
    await openProjectTab(page, "Аналитика");
    await page.getByRole("button", { name: "Обновить статистику" }).click();
    const report = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Отчёт" }),
    });
    await expect(report.getByText("Потрачено за 7 дней")).toBeVisible({
      timeout: 30_000,
    });
    await expect(report.locator("p.text-2xl")).toContainText(/₽/);
    await expect(report.locator("p.text-xs", { hasText: "Показы" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(report.locator("p.text-xs", { hasText: "Клики" })).toBeVisible();
    await expect(report.locator("ul li").first()).toBeVisible();
    await expect(report.getByText(/CTR .+% · CPC /)).toBeVisible();
    await shot(page, "after-analytics");
  });

  test("4. рекомендации → Принять → Применить → журнал аудита (пользователь)", async () => {
    await openProjectTab(page, "Рекомендации");
    await page.getByRole("button", { name: "Построить рекомендации" }).click();
    const recs = recSection(page);
    await expect(recs.locator("li").first()).toBeVisible({ timeout: 30_000 });
    await recs.getByRole("button", { name: "Принять" }).first().click();
    await recs
      .getByRole("button", { name: "Применить в кабинет" })
      .first()
      .click();
    await expect(recs.getByText(/applied/)).toBeVisible({ timeout: 30_000 });

    await openProjectTab(page, "Журнал");
    const audit = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Журнал записей в кабинет" }),
    });
    await expect(audit.getByText(/пользователь · /).first()).toBeVisible();
    await expect(audit.getByText("Минус-слова").first()).toBeVisible();
    await expect(audit.getByText("успех").first()).toBeVisible();
  });

  test("5. автопилот: блок до порога → разбор рекомендаций → включение", async () => {
    await openProjectTab(page, "Автопилот");
    const recs = recSection(page);
    await expect(
      page.getByRole("button", { name: "Включить автопилот" }),
    ).toBeDisabled();
    await expect(page.getByLabel(/Понимаю: автопилот сам применит/)).toBeDisabled();
    await expect(recs.getByText(/Нужно разобрать минимум 3/)).toBeVisible();

    await recs.getByRole("button", { name: "Принять" }).first().click();
    await recs
      .getByRole("button", { name: "Применить в кабинет" })
      .first()
      .click();
    await expect(recs.getByText(/applied/)).toHaveCount(2, { timeout: 30_000 });

    await recs.getByRole("button", { name: "Отклонить" }).first().click();
    await expect(
      page.getByText(
        "Качество рекомендаций достаточное, чтобы включить автопилот.",
      ),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByLabel(/Понимаю: автопилот сам применит/).check();
    await page.getByRole("button", { name: "Включить автопилот" }).click();
    await expect(
      page.getByRole("button", { name: "Выключить автопилот" }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("7. Расходы LLM и журнал: данные есть, промпт и ключи скрыты", async () => {
    await openProjectTab(page, "Расходы");
    const llm = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Расходы LLM" }),
    });
    await expect(llm.getByText("Вызовы", { exact: true })).toBeVisible();
    await expect(llm.getByText("Стоимость", { exact: true })).toBeVisible();
    await expect(llm.getByText("Пока нет вызовов")).toHaveCount(0);
    const previewCells = llm.locator("tbody tr td:last-child");
    await expect(previewCells.first()).toBeVisible();
    const previewText = (await previewCells.allTextContents()).join(" ");
    expect(previewText.length).toBeLessThan(2000);

    await openProjectTab(page, "Журнал");
    const audit = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Журнал записей в кабинет" }),
    });
    await expect(audit.getByText("Пока нет записей")).toHaveCount(0);
    await expect(audit.getByText(/пользователь · /).first()).toBeVisible();
    await assertNoSecretsInDom(page);
  });

  test("6. white-label: брендинг → инвайт → клиент видит только свой проект без записи", async () => {
    await page.goto("/projects");
    const brandForm = page.locator("form").filter({
      has: page.getByRole("heading", { name: "White-label" }),
    });
    await brandForm.getByPlaceholder("Название продукта").fill(productName);
    await brandForm.getByPlaceholder("slug (acme)").fill(slug);
    await brandForm.getByRole("button", { name: "Сохранить брендинг" }).click();
    await expect(
      page.getByText(`Белый кабинет: /login?slug=${slug}`),
    ).toBeVisible();
    await expect(page.getByText(productName).first()).toBeVisible();

    await projectLink(page, projectId).click();
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await openProjectTab(page, "Бриф");
    await page.getByPlaceholder("email клиента").fill(clientEmail);
    await page.getByRole("button", { name: "Пригласить" }).click();
    const linkLine = page.getByText(/^Ссылка для субклиента:/);
    await expect(linkLine).toBeVisible();
    const invitePath = (await linkLine.innerText())
      .replace(/^Ссылка для субклиента:\s*/, "")
      .trim();
    expect(invitePath).toMatch(/^\/invite\?token=/);

    const clientPage = await browser.newPage();
    await clientPage.goto(invitePath);
    await expect(
      clientPage.getByRole("heading", { name: "Приглашение" }),
    ).toBeVisible();
    await clientPage
      .getByPlaceholder("Пароль (минимум 8 символов)")
      .fill(clientPassword);
    await clientPage.getByRole("button", { name: "Войти в кабинет" }).click();
    await expect(clientPage).toHaveURL(/\/projects$/);
    await expect(clientPage.getByText(productName).first()).toBeVisible();
    await expect(
      clientPage.getByText("Вам доступны только назначенные проекты"),
    ).toBeVisible();
    await expect(
      clientPage.getByRole("heading", { name: "Новый проект + бриф" }),
    ).toHaveCount(0);
    await expect(
      clientPage.getByRole("heading", { name: "White-label" }),
    ).toHaveCount(0);
    await expect(
      projectLink(clientPage, projectId),
    ).toHaveCount(1);

    await projectLink(clientPage, projectId).click();
    await expect(clientPage.getByText(/только просмотр/)).toBeVisible();
    await expect(
      clientPage.getByText(/Кабинет в режиме просмотра/),
    ).toBeVisible();
    await expect(
      clientPage.getByRole("button", { name: "Прогнать пайплайн до черновика" }),
    ).toBeDisabled();
    await expect(
      clientPage.getByRole("button", { name: "Обновить токен" }),
    ).toBeDisabled();
    await expect(
      clientPage.getByRole("button", { name: "Отключить аккаунт" }),
    ).toBeDisabled();
    await openProjectTab(clientPage, "Кампания");
    await expect(
      clientPage.getByRole("button", { name: "Запустить кампанию" }),
    ).toBeDisabled();
    await openProjectTab(clientPage, "Объявления");
    await expect(
      clientPage.getByRole("button", { name: "Сгенерировать изображения" }),
    ).toBeDisabled();
    await expect(
      clientPage.getByRole("button", { name: "Сгенерировать видео" }),
    ).toBeDisabled();
    await expect(
      clientPage.getByRole("heading", { name: "Доступ субклиента" }),
    ).toHaveCount(0);
    await shot(clientPage, "after-client-readonly");
    await assertNoSecretsInDom(clientPage);
    await clientPage.close();
  });
});
