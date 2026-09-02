import { expect, test } from "@playwright/test";
import { fillCreateForm, projectLink } from "./create-project";

const stamp = Date.now().toString(36);
const email = `portfolio.${stamp}@e2e.local`;
const password = "E2ePassw0rd!";
const alertName = `Alert Shop ${stamp}`;
const quietYandex = `Quiet Yandex ${stamp}`;
const quietGoogle = `Quiet Google ${stamp}`;

test.describe("Портфель Мои проекты", () => {
  test("фильтр «есть алерты» оставляет нужные проекты, клик открывает кабинет", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.getByPlaceholder("Название организации").fill(`Agency ${stamp}`);
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Пароль (минимум 8 символов)").fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "Мои проекты" })).toBeVisible();

    const alertProjectId = await fillCreateForm(page, alertName, {
      platform: "yandex_direct",
    });
    const alertLink = projectLink(page, alertProjectId);

    await page.getByRole("button", { name: "Подключить Яндекс Директ" }).click();
    await expect(page).toHaveURL(/oauth=connected/, { timeout: 30_000 });
    await expect(page.getByText("Яндекс Директ подключён.")).toBeVisible();
    await expect(page.getByText("OAuth-токен скоро истечёт")).toBeVisible();

    await page.goto("/projects");
    const quietYandexId = await fillCreateForm(page, quietYandex, {
      platform: "yandex_direct",
    });
    await page.goto("/projects");
    const quietGoogleId = await fillCreateForm(page, quietGoogle, {
      platform: "google_ads",
    });
    await page.goto("/projects");

    await expect(alertLink).toBeVisible();
    await expect(projectLink(page, quietYandexId)).toBeVisible();
    await expect(projectLink(page, quietGoogleId)).toBeVisible();

    await page.getByLabel("Фильтр по алертам").selectOption("yes");
    await expect(alertLink).toBeVisible();
    await expect(projectLink(page, quietYandexId)).toHaveCount(0);
    await expect(projectLink(page, quietGoogleId)).toHaveCount(0);

    await alertLink.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${alertProjectId}`));
    await expect(page.getByRole("heading", { name: alertName })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Разделы проекта" }),
    ).toBeVisible();
  });
});
