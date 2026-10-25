import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  medicineInfoResponse,
  type MedicineCandidate,
} from "../../packages/contracts/src/index";

const LABEL =
  "Medication: Lisinopril\nStrength: 10 mg\nForm: tablet\nQuantity: 30\nDirections: Take one tablet by mouth once daily.";
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Personal workspace" });

async function layout(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflowing: [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .map((el) => `${el.tagName}.${el.className}`)
      .slice(0, 12),
  }));
  expect(dimensions.width, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
}

async function confirmedCase(page: Page) {
  await nav(page)
    .getByRole("button", { name: "Add a label", exact: true })
    .click();
  await page.getByText("Type or paste text", { exact: true }).click();
  await page.getByLabel("Fictional label text").fill(LABEL);
  await page
    .getByLabel("I confirm this is fictional demo information.")
    .check();
  await page.getByRole("button", { name: /Check label details/ }).click();
  await expect(
    page.getByRole("heading", { name: "Check the label details" }),
  ).toBeVisible();
  for (const name of [
    "Medication name",
    "Strength",
    "Dosage form",
    "Exact directions",
  ]) {
    await page
      .getByRole("button", { name: `Confirm it matches ${name}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Confirmed ${name}`, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Save to My labels", exact: true })
    .click();
  await expect(page.getByText("Saved to My labels").first()).toBeVisible();
}

async function signup(page: Page, name: string, supporter = false) {
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Preferred name").fill(name);
  await page
    .getByLabel("Email address")
    .fill(`${name}.${crypto.randomUUID()}@example.test`);
  await page.getByLabel(/^Password/).fill("synthetic demo password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome to LabelBridge" }),
  ).toBeVisible();
  if (supporter)
    await page.getByLabel("Help a family member or friend").check();
  await page.getByLabel("Volunteer to read label text").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Saved fictional labels", exact: true }),
  ).toBeVisible();
}

test("signup keeps the preference step and persists optional workspaces", async ({
  page,
}) => {
  await page.goto("/");
  await signup(page, "June", true);
  const switcher = page.getByRole("group", { name: "Other workspaces" });
  await expect(
    switcher.getByRole("button", { name: "Supporter", exact: true }),
  ).toBeVisible();
  await switcher
    .getByRole("button", { name: "Volunteer", exact: true })
    .click();
  await expect(
    page.getByText("Your volunteer application is waiting for approval"),
  ).toBeVisible();
  await page.reload();
  await expect(
    switcher.getByRole("button", { name: "Supporter", exact: true }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`photo editor handles synthetic uploads at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByText("Upload a photo", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Take a photo", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#label-camera")).toHaveAttribute(
      "capture",
      "environment",
    );
    // A malformed HEIC must produce guidance, never a successful preview.
    await page.locator("#label-photo").setInputFiles({
      name: "synthetic.HEIC",
      mimeType: "image/heic",
      buffer: Buffer.concat([
        Buffer.from([0, 0, 0, 36]),
        Buffer.from("ftypheic"),
        Buffer.alloc(40),
      ]),
    });
    await expect(page.locator("#photo-error")).toContainText(
      /cannot convert HEIC|Most Compatible/,
    );
    await page.locator("#label-photo").setInputFiles({
      name: "fictional.png",
      mimeType: "image/png",
      buffer: readFileSync(
        new URL("../../fixtures/labels/clear.png", import.meta.url),
      ),
    });
    await page
      .getByRole("button", { name: "Rotate right", exact: true })
      .click();
    await page.getByLabel(/Trim top/).fill("10");
    await page
      .getByRole("button", { name: "Apply changes", exact: true })
      .click();
    await expect(page.getByText(/^Changes applied\./)).toBeVisible();
    await expect(page.locator(".upload-state h3")).toHaveText("fictional.jpg");
    await layout(page);
    await page.screenshot({
      path: testInfo.outputPath("photo-editor.png"),
      fullPage: true,
    });
  });

  test(`save, share and revoke a label at ${viewport.width}px`, async ({
    page,
    browser,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await signup(page, "June", true);
    await confirmedCase(page);
    await layout(page);
    await page.getByRole("button", { name: /Explore support/ }).click();
    await expect(
      page.getByRole("heading", {
        name: "Understand your directions",
        level: 2,
      }),
    ).toBeVisible();
    await layout(page);
    await nav(page)
      .getByRole("button", { name: "Support circle", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Support circle" })
      .getByRole("button", { name: "Invite", exact: true })
      .click();
    await page.getByLabel("Their name").fill("Alex");
    await page.getByRole("button", { name: "Create invitation code" }).click();
    const code = await page.locator(".invite-code").innerText();
    await expect(page.getByText(/No email or message was sent/)).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const supporter = await browser.newContext({ viewport });
    try {
      const helper = await supporter.newPage();
      await helper.goto(testInfo.project.use.baseURL!);
      await signup(helper, "Alex", true);
      await nav(helper)
        .getByRole("button", { name: "Support circle", exact: true })
        .click();
      await helper
        .getByRole("navigation", { name: "Support circle" })
        .getByRole("button", { name: "Accept an invitation", exact: true })
        .click();
      await helper.getByLabel("Invitation code").fill(code);
      await helper
        .getByRole("button", { name: "Accept invitation", exact: true })
        .click();
      await expect(
        helper.getByText("Invitation accepted.", { exact: true }),
      ).toBeVisible();
      const switcher = helper.getByRole("group", { name: "Other workspaces" });
      await switcher
        .getByRole("button", { name: "Supporter", exact: true })
        .click();
      await expect(
        helper.getByRole("heading", {
          name: "No labels are shared with you right now",
        }),
      ).toBeVisible();
      // Refresh to receive the connection accepted in the other browser session.
      await page.reload();
      await nav(page)
        .getByRole("button", { name: "Support circle", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Manage Alex", exact: true })
        .click();
      await page.getByLabel("Exact directions", { exact: true }).check();
      await expect(page.locator(".preview-card")).toContainText(
        "Take one tablet by mouth once daily.",
      );
      await expect(page.locator(".preview-card")).not.toContainText("10 mg");
      await layout(page);
      await page.screenshot({
        path: testInfo.outputPath("sharing-preview.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Save sharing choices" }).click();
      await expect(page.getByText("Sharing saved for Alex.")).toBeVisible();
      await helper.reload();
      await switcher
        .getByRole("button", { name: "Supporter", exact: true })
        .click();
      await expect(
        helper.getByText("Take one tablet by mouth once daily.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(helper.locator("main")).not.toContainText("10 mg");
      await layout(helper);
      await helper.screenshot({
        path: testInfo.outputPath("supporter.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Stop sharing this label" })
        .click();
      await expect(
        page.getByText("Access to this label was removed."),
      ).toBeVisible();
      await helper.reload();
      await switcher
        .getByRole("button", { name: "Supporter", exact: true })
        .click();
      await expect(
        helper.getByRole("heading", {
          name: "No labels are shared with you right now",
        }),
      ).toBeVisible();
    } finally {
      await supporter.close();
    }
    expect(errors).toEqual([]);
  });
}

for (const viewport of [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
]) {
  test(`account screens fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await layout(page);
    await signup(page, "Taylor", true);
    await layout(page);
    await nav(page)
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page.getByLabel("Largest", { exact: true }).check();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(
      page.getByText("Settings saved.", { exact: true }),
    ).toBeVisible();
    await layout(page);
    await page.screenshot({
      path: testInfo.outputPath("settings-largest.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await layout(page);
  });
}

test("medicine source explorer uses explicit browser fixtures", async ({
  page,
}, testInfo) => {
  const identity: MedicineCandidate = {
    rxcui: "314076",
    name: "lisinopril 10 MG Oral Tablet",
    termType: "SCD",
    brand: null,
    ingredients: ["lisinopril"],
    strengths: ["10 MG"],
    doseForm: "Oral Tablet",
    releaseType: "not_stated",
    match: {
      level: "formulation",
      checks: [
        {
          attribute: "strength",
          status: "match",
          note: "Synthetic browser fixture",
        },
      ],
    },
  };
  const envelope = (data: unknown) => ({
    contractVersion: "1",
    requestId: "browser-fixture",
    dataMode: "fixture",
    data,
  });
  const info = JSON.parse(
    readFileSync(
      new URL("../../fixtures/medicine-info.json", import.meta.url),
      "utf8",
    ),
  );
  await page.route("**/api/cases/*/medicine/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    let data;
    if (path.endsWith("/candidates")) {
      expect(body.consent).toBe(true);
      data = {
        status: "multiple",
        identityKey: info.identityKey,
        query: {
          medicationName: "Lisinopril",
          strength: "10 mg",
          dosageForm: "tablet",
        },
        candidates: [
          identity,
          {
            ...identity,
            rxcui: "314077",
            name: "lisinopril 20 MG Oral Tablet",
            match: {
              level: "conflict",
              checks: [
                {
                  attribute: "strength",
                  status: "mismatch",
                  note: "Different strength",
                },
              ],
            },
          },
        ],
        retrievedAt: "2026-10-25T12:00:00.000Z",
      };
    } else if (path.endsWith("/confirm")) {
      data = {
        identityKey: info.identityKey,
        identity,
        confirmedAt: "2026-10-25T12:00:00.000Z",
      };
    } else {
      data = {
        ...info,
        language: body.language,
        mode: body.mode,
        sections: info.sections.map((s: { key: string }) => ({
          ...s,
          summary: null,
          summaryStatus: "disabled",
          translations: null,
          translationStatus: "disabled",
        })),
      };
      medicineInfoResponse.parse(envelope(data));
    }
    await route.fulfill({ json: envelope(data) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await signup(page, "Riley");
  await confirmedCase(page);
  await page.getByRole("button", { name: /Explore support/ }).click();
  await page.getByLabel(/Send the confirmed name, strength and form/).check();
  await page
    .getByRole("button", { name: "Find the reference medicine" })
    .click();
  await expect(
    page.getByRole("radio", { name: /lisinopril 20 MG/ }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: /lisinopril 10 MG/ }).check();
  await page
    .getByLabel("I compared this reference medicine with my confirmed label.")
    .check();
  await page.getByRole("button", { name: "Confirm reference match" }).click();
  await page.getByRole("button", { name: "Understand this medicine" }).click();
  await expect(
    page.getByText("Synthetic fixture warning passage.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/AI summaries are turned off/).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Personalized checker unavailable"),
  ).toBeVisible();
  const source = page.getByRole("button", { name: "Show my source" }).first();
  await source.click();
  const dialog = page.getByRole("dialog", { name: "Uses", exact: true });
  await expect(
    dialog.getByText("Synthetic fixture passage about uses."),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("source-explorer.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(source).toBeFocused();
  await layout(page);
});
