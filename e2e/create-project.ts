import { expect, type Page } from "@playwright/test";

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
): Promise<void> {
  const form = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Новый проект + бриф" }),
  });
  await form.getByPlaceholder("Название").fill(name);
  await form.locator("select").selectOption(options?.platform ?? "yandex_direct");
  await form
    .getByPlaceholder("https://example.com")
    .fill(options?.website ?? "https://e2e-shop.example");
  await form.getByRole("button", { name: "Далее" }).click();
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
  await form.getByRole("button", { name: "Далее" }).click();
  await expect(form.getByText("Подключить кабинет")).toBeVisible();
  await form.getByRole("button", { name: "Создать" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);
}
