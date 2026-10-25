import { test, expect, type Page } from "@playwright/test";
const board = (page: Page) => page.getByRole("main");
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Community", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Community Resource Board" }),
  ).toBeVisible();
}
async function search(page: Page) {
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /(?:opportunit.*|results) loaded/i }),
  ).toBeVisible();
}
async function account(page: Page) {
  await page.request.post("/api/account/signup", {
    data: {
      name: "Fictional community visitor",
      email: `community.${crypto.randomUUID()}@example.test`,
      password: "synthetic community password",
      uses: { supporter: false, volunteer: false },
      fictionalDataAcknowledged: true,
    },
  });
}

test("Community uses the real production API, enforces radius, and separates resources", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await expect(page.getByLabel("Search location")).toHaveValue("Austin, TX");
  await expect(
    page.getByRole("combobox", { name: "Radius", exact: true }),
  ).toHaveValue("25");
  await expect(
    page.getByRole("combobox", { name: "Date window", exact: true }),
  ).toHaveValue("30");
  await search(page);
  await expect(
    page.getByRole("heading", { name: "Nearby opportunities", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Online opportunities", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Distance not verified", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Fictional distant workshop",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Synthetic demo results.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\bfixtures?\b/i);
  await page.screenshot({
    path: test.info().outputPath("community-desktop.png"),
    fullPage: true,
  });
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "Fictional community health workshop",
      exact: true,
    }),
  });
  await expect(card.getByText(/Approximately .*straight-line/)).toBeVisible();
  await expect(card.getByRole("link", { name: /View source/ })).toHaveAttribute(
    "href",
    "https://example.org/labelbridge/community/health-workshop",
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await card.getByRole("button", { name: "Copy public link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "https://example.org/labelbridge/community/health-workshop",
  );
  await card.getByText("Source evidence and uncertainties").click();
  await expect(card.getByText(/Registration required/).first()).toBeVisible();
  await page.getByLabel("Free only (explicitly listed)").check();
  await search(page);
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Free only (explicitly listed)").uncheck();
  await page
    .getByRole("button", { name: "Ongoing resources", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Fictional ongoing health resource calendar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Ongoing resource — no event date", { exact: true }),
  ).toBeVisible();
});

test("Community saves are private and defaults require an explicit choice", async ({
  page,
  browser,
}) => {
  await account(page);
  await open(page);
  await search(page);
  expect(
    (await (await page.request.get("/api/account")).json()).data.account
      .location,
  ).toBeUndefined();
  const first = page.getByRole("article").first();
  const title = await first.getByRole("heading").innerText();
  await first
    .getByRole("button", { name: `Save ${title}`, exact: true })
    .click();
  await expect(
    first.getByRole("button", { name: `Remove saved ${title}`, exact: true }),
  ).toBeVisible();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await account(otherPage);
  const otherSaves = await (
    await otherPage.request.get("/api/community/saved")
  ).json();
  expect(otherSaves.data).toEqual([]);
  await other.close();
  await page.getByLabel("Search location").fill("78701");
  await page
    .getByLabel("Save as default (updates profile location on search)")
    .check();
  await search(page);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /defaults and profile location saved/ }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/account")).json()).data.account
      .location,
  ).toBe("78701");
  await page.getByRole("button", { name: /Saved opportunities \(1\)/ }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: `Remove saved ${title}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No saved opportunities" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Personal workspace" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByLabel("Community location (city, state or ZIP)"),
  ).toHaveValue("78701");
});

test("Community handles empty locations and failed searches with explicit retry", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Search location").fill("Seattle, WA");
  await search(page);
  await expect(
    page.getByRole("heading", {
      name: "No matching opportunities",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/simulated examples cover Austin/)).toBeVisible();
  await page.route("**/api/community/listings?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "Synthetic outage; retry later.",
          retryable: true,
          requestId: "synthetic",
        },
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Synthetic outage");
  await page.unroute("**/api/community/listings?**");
  await page.getByLabel("Search location").fill("Austin, TX");
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nearby opportunities", exact: true }),
  ).toBeVisible();
});

test("disabled server configuration hides Community navigation", async ({
  page,
}) => {
  await page.route("**/api/community/config", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.enabled = false;
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Community", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "A little clarity. A little more confidence.",
    }),
  ).toBeVisible();
});

for (const width of [320, 390])
  test(`Community is keyboard accessible and fits ${width}px with largest text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() =>
      localStorage.setItem("labelbridge.textSize", "largest"),
    );
    await open(page);
    await page.getByLabel("Search location").focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Austin, TX");
    await page
      .getByRole("button", { name: "Find opportunities", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Nearby opportunities", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`community-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      board(page).getByRole("button", { name: "Copy public link" }).first(),
    ).toBeVisible();
  });
test("loading is announced and a rejected refresh retains the original results", async ({
  page,
}) => {
  await account(page);
  await open(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/community/listings?**", async (route) => {
    const upstream = await route.fetch();
    await gate;
    await route.fulfill({ response: upstream });
  });
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Searching public sources" }),
  ).toBeVisible();
  await expect(page.locator(".community-skeleton")).toHaveCount(3);
  release();
  await expect(
    page.getByRole("heading", { name: "Nearby opportunities", exact: true }),
  ).toBeVisible();
  const timestamp = await page.locator(".community-summary").innerText();
  await page
    .getByRole("button", { name: "Refresh sources", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("cooling down");
  await expect(
    page.getByRole("heading", { name: "Nearby opportunities", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Refresh unavailable; previous retrieval timestamps retained.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (await page.locator(".community-summary").innerText()).replace(
      /(?:fresh|cached|stale) ·/,
      "CACHE ·",
    ),
  ).toBe(timestamp.replace(/(?:fresh|cached|stale) ·/, "CACHE ·"));
});
