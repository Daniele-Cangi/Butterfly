import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const screenshotDirectory = "screenshots";

async function capture(page: Page, name: string, sidebarPosition: "top" | "bottom" = "top") {
  await mkdir(screenshotDirectory, { recursive: true });
  await page.evaluate(position => {
    window.scrollTo(0, 0);
    const sidebar = document.querySelector<HTMLElement>(".side");
    if (sidebar) sidebar.scrollTop = position === "bottom" ? sidebar.scrollHeight : 0;
  }, sidebarPosition);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: screenshotDirectory + "/" + name, fullPage: true });
}

async function seek(slider: Locator, minute: number) {
  await slider.evaluate((input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, minute);
}

test("original, missed MomentFrame, ferry recovery, intermediate wait, apply and reset", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByText("Local sample", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A crossing changes an afternoon." })).toBeVisible();
  await expect(page.getByTestId("scene-ready")).toBeAttached();

  const slider = page.getByRole("slider", { name: "Seek scenario time" });
  await seek(slider, 50);
  await expect(page.locator(".scene-meta strong")).toHaveText("16:50");
  await page.getByRole("button", { name: "Keep this moment" }).click();
  await expect(page.getByRole("group", { name: "MomentFrame versions" })).toBeVisible();
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();
  await capture(page, "01-original-composition-desktop.png");
  await page.getByRole("button", { name: "Return to neighborhood" }).click();

  await seek(slider, 20);
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await expect(page.getByText("Bridge closure locked during recovery")).toBeVisible();
  await page.getByRole("button", { name: /^The photograph:/ }).click();
  await expect(page.getByRole("heading", { name: "The photograph is now a missed moment." })).toBeVisible();
  await expect(page.getByText("16:30 → 16:55")).toBeVisible();
  await expect(page.getByText("This moment was missed.")).toBeVisible();
  await page.getByRole("button", { name: "Show original traces" }).click();
  await page.getByRole("button", { name: "Harbor Gazette unsupported" }).click();
  await expect(page.getByText(/Claim unsupported by the variant/)).toBeVisible();
  await page.getByRole("button", { name: /^The photograph:/ }).click();
  await capture(page, "02-bridge-closed-missed-desktop.png");
  await capture(page, "10-causal-inspector-desktop.png", "bottom");

  await page.getByRole("button", { name: "Keep this moment" }).click();
  await expect(page.getByText("Ways to keep the moment")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate ferry", exact: true })).toBeVisible();
  await expect(page.getByText("Depart at 16:00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Your variant", exact: true }).click();
  await expect(page.getByText("Missed here · original composition remains viewable")).toBeVisible();
  await capture(page, "03-momentframe-missed-variant-desktop.png");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await capture(page, "04-momentframe-original-reference-desktop.png");

  await page.getByRole("button", { name: "Activate ferry", exact: true }).click();
  await page.getByRole("button", { name: "Recovery preview", exact: true }).click();
  await expect(page.getByText(/Recovery preview · MomentFrame/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recovery preview keeps the photograph possible at 16:50." })).toBeVisible();
  await expect(page.getByText("Photo at 16:50: possible.")).toBeVisible();
  await expect(page.getByText("Delivery 16:40 · Setup 16:50 · Photograph possible").first()).toBeVisible();
  await capture(page, "05-ferry-recovery-preview-desktop.png");

  await page.getByRole("button", { name: "Return to neighborhood" }).click();
  await seek(slider, 29);
  await expect(page.getByText("Courier waiting at Ferry pier")).toBeVisible();
  await expect(page.getByRole("button", { name: "Flower delivery: Waiting at Ferry pier" })).toBeVisible();
  await capture(page, "06-intermediate-ferry-wait-desktop.png");
  await seek(slider, 50);
  await page.getByRole("button", { name: "Apply to my variant" }).click();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();
  await expect(page.getByText("Bridge closure locked during recovery")).toBeVisible();
  await expect(page.getByText("Courier at Sunlit plaza")).toBeVisible();
  await capture(page, "07-ferry-recovery-applied-desktop.png");

  await page.getByRole("button", { name: "Reset variant" }).click();
  await expect(page.getByRole("button", { name: "Close bridge at 16:15" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The photograph can happen." })).toBeVisible();

  // The other intervention works independently of card ordering.
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await page.getByRole("button", { name: /^The photograph:/ }).click();
  await page.getByRole("button", { name: "Keep this moment" }).click();
  await page.getByRole("button", { name: "Depart at 16:00", exact: true }).click();
  await expect(page.getByText("Delivery 16:10 · Setup 16:20 · Photograph possible")).toBeVisible();
  await page.getByRole("button", { name: "Apply to my variant" }).click();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();
  await expect(page.getByText("Bridge closure locked during recovery")).toBeVisible();
  await expect(page.getByText("16:30 → 16:10")).toBeVisible();
  await capture(page, "08-early-departure-recovery-applied-desktop.png");
  expect(errors).toEqual([]);
});

test("mobile reduced-motion MomentFrame and text controls remain usable", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("scene-ready")).toBeAttached();
  await expect(page.getByRole("button", { name: "Play" })).toBeDisabled();
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await page.getByRole("button", { name: /^The photograph:/ }).click();
  await page.getByRole("button", { name: "Keep this moment" }).click();
  await expect(page.getByRole("group", { name: "MomentFrame versions" })).toBeVisible();
  await page.getByRole("button", { name: "Recovery preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recovery preview keeps the photograph possible at 16:50." })).toBeVisible();
  await capture(page, "09-recovery-mobile.png");
  await expect(page.getByRole("button", { name: "Apply to my variant" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("studio explains missing Sanity configuration", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Configure a dedicated Sanity project to open Butterfly Studio.")).toBeVisible();
});
