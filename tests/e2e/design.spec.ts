import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { caseResponse } from "../../packages/contracts/src/index";

test("reference intake keeps consent, help and real server field review", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const intake = page.locator("form.intake");
  expect((await intake.boundingBox())!.width).toBeCloseTo(1320, 0);
  await expect(
    page.getByRole("navigation", { name: "Workspaces" }),
  ).toBeVisible();
  for (const name of ["Patient", "Supporter", "Volunteer reader", "Account"])
    await expect(
      page
        .getByRole("navigation", { name: "Workspaces", exact: true })
        .getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await expect(page.getByText("Demo views", { exact: true })).toHaveCount(0);
  await expect(page.locator(".method-card.selected")).toHaveCSS(
    "background-color",
    "rgb(232, 241, 234)",
  );
  await expect(page.locator(".method-card")).toHaveCount(2);
  await expect(page.getByText("Try a sample", { exact: true })).toHaveCount(0);
  const submit = page.getByRole("button", { name: /Check label details/ });
  await expect(submit).toBeDisabled();
  await page.getByRole("link", { name: "Get help", exact: true }).click();
  await expect(page.locator("#help")).toHaveAttribute("open", "");
  await page.locator("#help summary").click();
  const acknowledgement = page.getByLabel(
    "I confirm this is fictional demo information.",
  );
  await acknowledgement.focus();
  await page.keyboard.press("Space");
  await expect(submit).toBeDisabled();
  await page.getByText("Type or paste text", { exact: true }).click();
  await page
    .getByLabel("Fictional label text")
    .fill(
      "Medication: Levothyroxine Sodium\nStrength: 0.05 mg\nForm: tablet\nQuantity: 30\nDirections: Take one tablet twice daily as needed.",
    );
  await expect(submit).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("reference-desktop.png"),
    fullPage: true,
  });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/cases") &&
      response.request().method() === "POST",
  );
  await submit.click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const result = caseResponse.parse(await response.json());
  expect(
    result.data.fields.find((field) => field.key === "strength")?.value,
  ).toBe("0.05 mg");
  expect(
    result.data.fields.find((field) => field.key === "quantity")?.value,
  ).toBe("30");
  await expect(
    page.getByRole("heading", { name: "Check the label details", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#field-strength-input")).toHaveValue("0.05 mg");
  const blocked = await page.request.post(
    `/api/cases/${result.data.id}/explanation`,
    { data: { expectedRevision: result.data.revision } },
  );
  expect(blocked.status()).toBe(422);
  expect((await blocked.json()).error.code).toBe("NEEDS_CLARIFICATION");
  await page.screenshot({
    path: testInfo.outputPath("reference-review.png"),
    fullPage: true,
  });
});

for (const width of [320, 360]) {
  test(`reference intake fits ${width}px with largest text`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const textSize = page.getByRole("button", { name: /Text size:/ });
    await textSize.click();
    await textSize.click();
    await expect(page.locator("html")).toHaveClass(/largest-text/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`reference-mobile-${width}.png`),
      fullPage: true,
    });
  });
}

test("styled photo intake still submits original image bytes to the API", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByText("Upload a photo", { exact: true }).click();
  await page.locator("#label-photo").setInputFiles({
    name: "fictional-label.png",
    mimeType: "image/png",
    buffer: readFileSync(
      new URL("../../fixtures/labels/clear.png", import.meta.url),
    ),
  });
  await page
    .getByLabel("I confirm this is fictional demo information.")
    .check();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/cases") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Check label details/ }).click();
  const response = await responsePromise;
  const result = caseResponse.parse(await response.json());
  expect(response.status()).toBe(201);
  expect(result.dataMode).toBe("fixture");
  expect(
    result.data.fields.every(
      (field) => field.value === null && field.reviewState === "unresolved",
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Check the label details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByAltText("Your uploaded label photo fictional-label.png"),
  ).toBeVisible();
  const blocked = await page.request.post(
    `/api/cases/${result.data.id}/explanation`,
    { data: { expectedRevision: result.data.revision } },
  );
  expect(blocked.status()).toBe(422);
  expect((await blocked.json()).error.code).toBe("NEEDS_CLARIFICATION");
  await page.screenshot({
    path: testInfo.outputPath("reference-upload-review.png"),
    fullPage: true,
  });
});
