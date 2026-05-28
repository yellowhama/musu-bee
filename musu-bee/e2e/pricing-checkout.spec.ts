import { expect, test, type Page } from "@playwright/test";

const hasClientToken = Boolean(process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim());

async function mockCheckoutRoute(page: Page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.endsWith("/api/checkout")) {
        let tier = "pro";
        if (typeof init?.body === "string") {
          try {
            const payload = JSON.parse(init.body) as { tier?: string };
            if (payload.tier === "pro" || payload.tier === "team") {
              tier = payload.tier;
            }
          } catch {
            // Keep default tier for malformed payloads.
          }
        }
        (window as { __MUSU_CHECKOUT_EVENTS__?: Array<{ kind: string; tier?: string }> }).__MUSU_CHECKOUT_EVENTS__?.push({
          kind: "checkout_fetch",
          tier,
        });
        return new Response(
          JSON.stringify({
            provider: "paddle",
            transactionId: `txn_${tier}_1`,
            url: `/pricing?success=1&tier=${tier}`,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return nativeFetch(input, init);
    };
  });
}

test.describe("token-present checkout branches", () => {
  test.skip(!hasClientToken, "Set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN for token-present checks.");

  test("overlay branch attempts Paddle Checkout.open with transactionId", async ({ page }) => {
    await page.addInitScript(() => {
      (window as {
        __MUSU_CHECKOUT_EVENTS__?: Array<{ kind: string; transactionId?: string }>;
        __MUSU_CHECKOUT_TEST_HOOKS__?: {
          initializePaddle?: () => Promise<{
            Checkout: { open: (input: { transactionId: string }) => void };
          }>;
        };
      }).__MUSU_CHECKOUT_EVENTS__ = [];

      (window as {
        __MUSU_CHECKOUT_TEST_HOOKS__?: {
          initializePaddle?: () => Promise<{
            Checkout: { open: (input: { transactionId: string }) => void };
          }>;
        };
      }).__MUSU_CHECKOUT_TEST_HOOKS__ = {
        initializePaddle: async () => ({
          Checkout: {
            open: ({ transactionId }: { transactionId: string }) => {
              (
                window as {
                  __MUSU_CHECKOUT_EVENTS__?: Array<{ kind: string; transactionId?: string }>;
                }
              ).__MUSU_CHECKOUT_EVENTS__?.push({
                kind: "overlay_open",
                transactionId,
              });
            },
          },
        }),
      };
    });

    await mockCheckoutRoute(page);
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Pro access" }).click();

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (
              window as {
                __MUSU_CHECKOUT_EVENTS__?: Array<{ kind: string; transactionId?: string }>;
              }
            ).__MUSU_CHECKOUT_EVENTS__ ?? [],
        ),
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "checkout_fetch", tier: "pro" }),
          expect.objectContaining({ kind: "overlay_open", transactionId: "txn_pro_1" }),
        ]),
      );
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test("init-fail branch falls back to hosted redirect when Paddle init throws", async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem("__MUSU_CHECKOUT_INIT_CALLED__")) {
        window.sessionStorage.setItem("__MUSU_CHECKOUT_INIT_CALLED__", "0");
      }

      (window as {
        __MUSU_CHECKOUT_TEST_HOOKS__?: {
          initializePaddle?: () => Promise<never>;
        };
      }).__MUSU_CHECKOUT_TEST_HOOKS__ = {
        initializePaddle: async () => {
          window.sessionStorage.setItem("__MUSU_CHECKOUT_INIT_CALLED__", "1");
          throw new Error("forced_init_failure");
        },
      };
    });

    await mockCheckoutRoute(page);
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Team access" }).click();

    await page.waitForURL(/\/pricing\?success=1&tier=team/);
    const initCalled = await page.evaluate(() =>
      window.sessionStorage.getItem("__MUSU_CHECKOUT_INIT_CALLED__"),
    );
    expect(initCalled).toBe("1");
  });
});
