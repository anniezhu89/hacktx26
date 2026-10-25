import { test, expect } from "@playwright/test";
test("production server serves React and contract-valid API", async ({
  page,
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({
    contractVersion: "1",
    dataMode: "fixture",
    data: { status: "ok" },
  });
  await page.goto("/");
  await expect(page.getByText("Demo: fictional medication data")).toBeVisible();
  await page.getByText("Developer diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Check backend connection" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Backend connected. Data mode: fixture. Contract version: 1.",
  );
});
test("development proxy reaches API at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`http://127.0.0.1:${process.env.SMOKE_WEB_PORT || 43128}`);
  await page.getByText("Developer diagnostics", { exact: true }).click();
  await page.getByRole("button", { name: "Check backend connection" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "Backend connected. Data mode: fixture.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
