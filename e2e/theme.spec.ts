import { expect, test } from "@playwright/test";

test("the theme choice survives a reload and applies before the first paint", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Theme: System" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();

  // Sobald <body> entsteht, muss `.dark` schon gesetzt sein, sonst blitzt die Seite hell auf.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      (window as unknown as { darkAtBody: boolean }).darkAtBody =
        document.documentElement.classList.contains("dark");
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();

  expect(await page.evaluate(() => (window as unknown as { darkAtBody?: boolean }).darkAtBody)).toBe(true);
  await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();
});
