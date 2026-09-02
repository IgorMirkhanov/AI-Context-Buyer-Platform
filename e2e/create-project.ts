import { expect, type Page } from "@playwright/test";

export function projectIdFromUrl(url: string): string | undefined {
  return url.match(/\/projects\/([0-9a-f-]{36})/)?.[1];
}

export async function fillCreateForm(
  page: Page,
  name: string,
  options?: {
    platform?: "yandex_direct" | "google_ads";
    website?: string;
    usp?: string;
    audience?: string;
    negatives?: string;
  },
): Promise<string> {
  const form = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Новый проект + бриф" }),
  });
  await form.getByPlaceholder("Название").fill(name);
  await form.locator("select").selectOption(options?.platform ?? "yandex_direct");
  await form
    .getByPlaceholder("https://example.com")
    .fill(options?.website ?? "https://e2e-shop.example");
  await form.getByRole("button", { name: "Далее" }).click();
  await expect(form.getByText("Аудитория и УТП", { exact: true })).toBeVisible();
  await form
    .getByPlaceholder("УТП — каждое с новой строки")
    .fill(options?.usp ?? "Быстрая поставка");
  await form
    .getByPlaceholder("Целевая аудитория — сегмент с новой строки")
    .fill(options?.audience ?? "IT-отделы");
  if (options?.negatives != null) {
    await form
      .getByPlaceholder("Минус-слова (через запятую или с новой строки)")
      .fill(options.negatives);
  }
  await form.getByRole("button", { name: "Далее" }).click();
  await expect(form.getByText("Бюджет и гео", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Далее" }).click();
  await expect(form.getByText("Подключить кабинет", { exact: true })).toBeVisible();
  if (!projectIdFromUrl(page.url())) {
    await form.getByRole("button", { name: "Создать" }).click();
  }
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const id = projectIdFromUrl(page.url());
  expect(id, "project id after create").toBeTruthy();
  return id!;
}

export function projectLink(page: Page, projectId: string) {
  return page.locator(`a[href="/projects/${projectId}"]`);
}
