import { expect, test, type Page } from "@playwright/test";
import { fillCreateForm } from "./create-project";

const stamp = Date.now().toString(36);
const ownerEmail = `owner.ctx.${stamp}@e2e.local`;
const specialistEmail = `spec.${stamp}@e2e.local`;
const password = "E2ePassw0rd!";
const specialistPassword = "SpecPassw0rd!";
const projectA = `Alpha ${stamp}`;
const projectB = `Beta ${stamp}`;
const projectC = `Gamma ${stamp}`;

async function openProjectTab(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Разделы проекта" })
    .getByRole("link", { name: label, exact: true })
    .click();
}

async function createProject(
  page: Page,
  name: string,
  urls: Map<string, string>,
): Promise<void> {
  await page.goto("/projects");
  await fillCreateForm(page, name);
  urls.set(name, page.url());
}

async function assignSpecialist(
  page: Page,
  urls: Map<string, string>,
  projectName: string,
): Promise<string> {
  await page.goto(`${urls.get(projectName)!}?tab=brief`);
  await page.getByPlaceholder("email контекстолога").fill(specialistEmail);
  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/access") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Назначить" }).click();
  const response = await responsePromise;
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  const linkLine = page.getByText(/^Ссылка для контекстолога:/);
  await expect(linkLine).toBeVisible();
  return (await linkLine.innerText())
    .replace(/^Ссылка для контекстолога:\s*/, "")
    .trim();
}

test.describe("Контекстолог в портфеле", () => {
  test("видит только 2 из 3 назначенных проектов", async ({ page, browser }) => {
    const projectUrls = new Map<string, string>();

    await page.goto("/register");
    await page.getByPlaceholder("Название организации").fill(`Agency ${stamp}`);
    await page.getByPlaceholder("Email").fill(ownerEmail);
    await page.getByPlaceholder("Пароль (минимум 8 символов)").fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page).toHaveURL(/\/projects$/);

    await createProject(page, projectA, projectUrls);
    await createProject(page, projectB, projectUrls);
    await createProject(page, projectC, projectUrls);

    const invitePath = await assignSpecialist(page, projectUrls, projectA);
    await assignSpecialist(page, projectUrls, projectB);
    expect(invitePath).toMatch(/^\/invite\?token=/);

    const specialistContext = await browser.newContext();
    const specialistPage = await specialistContext.newPage();
    await specialistPage.goto(invitePath);
    await specialistPage
      .getByPlaceholder("Пароль (минимум 8 символов)")
      .fill(specialistPassword);
    await specialistPage.getByRole("button", { name: "Войти в кабинет" }).click();
    await expect(specialistPage).toHaveURL(/\/projects$/);

    await expect(
      specialistPage.getByText(
        "Вам доступны только проекты, которые назначил владелец агентства",
      ),
    ).toBeVisible();
    await expect(
      specialistPage.getByRole("heading", { name: "Новый проект + бриф" }),
    ).toHaveCount(0);
    await expect(specialistPage.getByRole("link", { name: projectA })).toHaveCount(
      1,
    );
    await expect(specialistPage.getByRole("link", { name: projectB })).toHaveCount(
      1,
    );
    await expect(specialistPage.getByRole("link", { name: projectC })).toHaveCount(
      0,
    );

    await specialistPage.goto(projectUrls.get(projectA)!);
    await expect(specialistPage.getByText(/только просмотр/)).toHaveCount(0);
    await openProjectTab(specialistPage, "Анализ");
    await expect(
      specialistPage.getByRole("button", { name: "Запустить анализ" }),
    ).toBeEnabled();
    await openProjectTab(specialistPage, "План");
    await expect(
      specialistPage.getByRole("button", { name: /Собрать семантику/ }),
    ).toBeDisabled();

    await specialistContext.close();
  });
});
