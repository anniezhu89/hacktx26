import { test, expect } from "@playwright/test";
import { healthResponse } from "../../packages/contracts/src/index";
test("production server serves decodRx with photo/text intake and contract-valid API", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(healthResponse.parse(await response.json())).toMatchObject({
    contractVersion: "1",
    dataMode: "fixture",
    data: { status: "ok" },
  });
  await page.goto("/");
  await expect(page).toHaveTitle("decodRx");
  await expect(
    page.getByRole("button", { name: "decodRx, start over" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /^Upload a photo/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /^Type or paste text/ }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(2);
  for (const text of [
    "Demo views",
    "Try a sample",
    "Developer diagnostics",
    "A reading aid, not a medical verification service.",
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Fixture data");
});
test("development proxy reaches API at mobile width without diagnostics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`http://127.0.0.1:${process.env.SMOKE_WEB_PORT || 43128}`);
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/health");
    return { status: result.status, body: await result.json() };
  });
  expect(response.status).toBe(200);
  expect(healthResponse.parse(response.body).data.status).toBe("ok");
  await page.getByRole("radio", { name: /^Type or paste text/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Fictional label text")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
