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
  await expect(page.getByText(/Local sample/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "A crossing changes an afternoon." })).toBeVisible();
  await expect(page.getByText(/The clock is a viewpoint into the day/)).toBeVisible();
  await expect(page.getByTestId("scene-ready")).toBeAttached({ timeout: 30000 });
  await capture(page, "00-first-visit-desktop.png");

  const slider = page.getByRole("slider", { name: "Seek scenario time" });
  await expect(slider).toHaveAttribute("aria-valuetext", "16:50");
  await seek(slider, 50);
  await expect(page.locator(".scene-meta strong")).toHaveText("16:50");
  await page.getByRole("button", { name: "View original moment" }).click();
  await expect(page.getByRole("group", { name: "MomentFrame versions" })).toBeVisible();
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();
  await capture(page, "01-original-composition-desktop.png");
  await page.getByRole("button", { name: "Return to neighborhood" }).click();

  await seek(slider, 20);
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await expect(page.getByText("Bridge closure locked during recovery")).toBeVisible();
  await expect(page.locator(".story-explanation p")).toContainText(/Flower delivery 16:55, Floral setup 17:05/);
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
  await expect(page.getByRole("group", { name: "MomentFrame versions" })).toBeVisible();
  await expect(page.getByText("Ways to keep the moment")).toHaveCount(0);
  await page.getByRole("button", { name: "Find alternatives" }).click();
  await expect(page.getByText("Ways to keep the moment")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate ferry", exact: true })).toBeVisible();
  await expect(page.getByText("Depart at 16:00", { exact: true })).toBeVisible();
  await expect(page.locator(".alternative")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Recovery preview", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Your variant", exact: true }).click();
  await expect(page.getByText("Missed here · original composition remains viewable")).toBeVisible();
  await capture(page, "03-momentframe-missed-variant-desktop.png");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await capture(page, "04-momentframe-original-reference-desktop.png");

  await page.getByRole("button", { name: "Activate ferry", exact: true }).click();
  await page.getByRole("button", { name: "Recovery preview", exact: true }).click();
  await expect(page.getByText(/Recovery preview · MomentFrame/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recovery preview keeps the photograph possible at 16:50." })).toBeVisible();
  await expect(page.getByText("Chosen composition at 16:50: possible.")).toBeVisible();
  await expect(page.getByText("Delivery 16:40 · Setup 16:50 · Photograph possible").first()).toBeVisible();
  await capture(page, "05-ferry-recovery-preview-desktop.png");

  await page.getByRole("button", { name: "Return to neighborhood" }).click();
  await seek(slider, 29);
  await expect(page.getByText("Courier waiting at Ferry pier")).toBeVisible();
  await expect(page.getByRole("button", { name: "Flower delivery: Waiting at Ferry pier" })).toBeVisible();
  await capture(page, "06-intermediate-ferry-wait-desktop.png");
  await seek(slider, 50);
  await page.getByRole("button", { name: "Use this solution" }).click();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();
  await expect(page.getByText("Bridge closure locked during recovery")).toBeVisible();
  await expect(page.getByText("Courier at Sunlit plaza")).toBeVisible();
  await capture(page, "07-ferry-recovery-applied-desktop.png");

  await page.getByRole("button", { name: "Reset variant" }).click();
  await expect(page.getByRole("button", { name: "Close bridge at 16:15" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();

  // The other intervention works independently of card ordering.
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await page.getByRole("button", { name: /^The photograph:/ }).click();
  await page.getByRole("button", { name: "Keep this moment" }).click();
  await page.getByRole("button", { name: "Find alternatives" }).click();
  await page.getByRole("button", { name: "Depart at 16:00", exact: true }).click();
  await expect(page.getByText("Delivery 16:10 · Setup 16:20 · Photograph possible")).toBeVisible();
  await page.getByRole("button", { name: "Use this solution" }).click();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();
  await expect(page.getByText("Bridge closure locked during recovery")).toBeVisible();
  await expect(page.getByText("16:30 → 16:10")).toBeVisible();
  await capture(page, "08-early-departure-recovery-applied-desktop.png");
  expect(errors).toEqual([]);
});

test("departure and ferry limits reshape the finite recovery domain", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByTestId("scene-ready")).toBeAttached({ timeout: 30000 });
  await page.getByRole("button", { name: "Departure 16:20" }).click();
  await expect(page.getByRole("slider", { name: "Seek scenario time" })).toHaveAttribute("aria-valuetext", "16:20");
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await page.getByRole("checkbox", { name: "Do not depart before 16:20" }).check();
  await page.getByRole("combobox", { name: "Ferry starts operating at" }).selectOption("35");
  await page.getByRole("button", { name: "Find alternatives" }).click();
  await expect(page.getByRole("heading", { name: "No alternative in this domain" })).toBeVisible();
  await expect(page.getByText(/none of the 1 allowed candidate changes preserves/)).toBeVisible();
  await expect(page.getByText(/This conclusion covers only the configured domain/)).toBeVisible();
  await capture(page, "11-limits-exhausted-desktop.png");

  await page.getByRole("checkbox", { name: "Do not depart before 16:20" }).uncheck();
  await page.getByRole("button", { name: "Find alternatives" }).click();
  await expect(page.getByRole("button", { name: "Depart at 16:00", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Depart at 16:00", exact: true }).click();
  await page.getByRole("button", { name: "Use this solution" }).click();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();
  await expect(page.getByText("Bridge closure locked during recovery")).toBeVisible();
  await page.getByText("Explore people, places, objects and routes").click();
  await page.getByRole("button", { name: "Mara, the courier" }).click();
  await expect(page.locator(".inspector h2")).toHaveText("Mara, the courier");
  expect(errors).toEqual([]);
});

test("text controls complete the recovery when WebGL is unavailable", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      if (contextId === "webgl" || contextId === "webgl2") return null;
      return Reflect.apply(original, this, [contextId, options]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "3D view unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await page.getByRole("button", { name: "Keep this moment" }).click();
  await page.getByRole("button", { name: "Find alternatives" }).click();
  await page.getByRole("button", { name: "Activate ferry", exact: true }).click();
  await expect(page.getByText(/featured photograph is possible/)).toBeVisible();
  await page.getByRole("button", { name: "Use this solution" }).click();
  await expect(page.getByRole("heading", { name: "The photograph happened at 16:50." })).toBeVisible();
  await capture(page, "12-text-only-recovery-desktop.png");
});

test("fractional seek, playback and MomentFrame keep every clock at one effective time", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expect(page.getByTestId("scene-ready")).toBeAttached({ timeout: 30000 });
  const slider = page.getByRole("slider", { name: "Seek scenario time" });
  await seek(slider, 20.05);
  await expect(slider).toHaveValue("20.05");
  await expect(page.getByTestId("scene-clock")).toHaveText("16:20");
  await expect(page.getByTestId("timeline-clock")).toHaveText("16:20");

  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForFunction(() => Number((document.querySelector("#time-slider") as HTMLInputElement).value) > 20.05, { timeout: 5000 });
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("scene-clock")).toHaveText((await page.getByTestId("timeline-clock").textContent()) ?? "");

  await seek(slider, 20);
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await page.getByRole("button", { name: /^The photograph:/ }).click();
  await page.getByRole("button", { name: "Keep this moment" }).click();
  await expect(page.getByRole("group", { name: "MomentFrame versions" })).toBeVisible();
  await expect(slider).toBeDisabled();
  await expect(page.getByTestId("scene-clock")).toHaveText("16:50");
  await expect(page.getByTestId("timeline-clock")).toHaveText("16:50");

  await page.getByRole("button", { name: "Your variant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The photograph is now a missed moment." })).toBeVisible();
  await page.getByRole("button", { name: "Floral setup", exact: true }).first().click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("scene-clock")).toHaveText("16:50");
  await expect(page.getByTestId("timeline-clock")).toHaveText("16:50");
  await expect(page.getByRole("heading", { name: "The photograph is now a missed moment." })).toBeVisible();

  await page.getByRole("button", { name: "Return to neighborhood" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("scene-clock")).toHaveText("16:49");
  await expect(page.getByTestId("timeline-clock")).toHaveText("16:49");
});

test("mobile reduced-motion MomentFrame and text controls remain usable", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("scene-ready")).toBeAttached({ timeout: 30000 });
  await expect(page.getByRole("button", { name: "Play" })).toBeDisabled();
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  await page.getByRole("button", { name: /^The photograph:/ }).click();
  await page.getByRole("button", { name: "Keep this moment" }).click();
  await page.getByRole("button", { name: "Find alternatives" }).click();
  await expect(page.getByRole("status")).toContainText("2 verified alternatives found");
  await expect(page.getByRole("group", { name: "MomentFrame versions" })).toBeVisible();
  await page.getByRole("button", { name: "Activate ferry", exact: true }).click();
  await page.getByRole("button", { name: "Recovery preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recovery preview keeps the photograph possible at 16:50." })).toBeVisible();
  await capture(page, "09-recovery-mobile.png");
  await expect(page.getByRole("button", { name: "Use this solution" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("desktop scrolling can continue from the side rail through Keep also", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Close bridge at 16:15" }).click();
  const side = page.locator(".side");
  await side.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await side.hover();

  for (let attempt = 0; attempt < 6; attempt++) {
    await page.mouse.wheel(0, 650);
    const atPageBottom = await page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight);
    if (atPageBottom) break;
  }

  await expect(page.locator(".constraints")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("checkbox", { name: "Do not depart before 16:20" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ferry starts operating at" })).toBeVisible();
  const bottomGap = await page.locator(".constraints").evaluate(element => document.documentElement.scrollHeight - window.scrollY - element.getBoundingClientRect().bottom);
  expect(bottomGap).toBeGreaterThanOrEqual(24);
  await page.screenshot({ path: screenshotDirectory + "/13-constraints-scroll-handoff-desktop.png" });
});

test("studio route exposes its configuration or Sanity connection state", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("http://localhost:3000/studio", { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator("body")).toContainText(/Configure a dedicated Sanity project|Connect this Studio to your project|Choose login provider|Butterfly world authoring/, { timeout: 30000 });
});
