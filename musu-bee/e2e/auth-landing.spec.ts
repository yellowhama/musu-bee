import { test, expect, type Page } from "@playwright/test";

function mockSupabaseSignUpSuccess(page: Page) {
  return page.route("**/auth/v1/signup", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "qa-signup@example.com",
        },
        session: null,
      }),
    });
  });
}

function mockSupabaseSignUpError(page: Page, message = "User already registered") {
  return page.route("**/auth/v1/signup", async (route) => {
    await route.fulfill({
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: 400,
        error_code: "user_already_exists",
        msg: message,
      }),
    });
  });
}

function mockSupabaseSignInSuccess(page: Page) {
  return page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        access_token: "access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "refresh-token",
        user: {
          id: "00000000-0000-4000-8000-000000000002",
          email: "qa-login@example.com",
        },
      }),
    });
  });
}

function mockSupabaseSignInError(page: Page, message = "Invalid login credentials") {
  return page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "invalid_grant",
        error_description: message,
      }),
    });
  });
}

test("landing renders waitlist flow and success message", async ({ page }) => {
  await page.goto("/landing");

  await expect(
    page.getByText("여러 대의 기기를 이미 굴리고 있다면, 이제 control plane이 필요하다.")
  ).toBeVisible();
  await expect(page.getByText("Join the waitlist")).toBeVisible();

  await page.getByPlaceholder("you@example.com").fill("qa-waitlist@example.com");
  await page.getByRole("button", { name: "Join Waitlist" }).click();

  await expect(page).toHaveURL(/\/landing\?waitlist=ok/);
  await expect(
    page.getByText("We will let you know when your access is ready.")
  ).toBeVisible();
});

test("signup happy path shows confirmation message", async ({ page }) => {
  await mockSupabaseSignUpSuccess(page);

  await page.goto("/auth/signup");
  await page.getByPlaceholder("you@example.com").fill("qa-signup@example.com");
  await page.locator('input[type="password"]').fill("password123");
  await page.getByRole("button", { name: "계정 만들기" }).click();

  await expect(page.getByText("확인 이메일을 보냈습니다")).toBeVisible();
  await expect(page.getByText(/qa-signup@example\.com.*확인 링크를 보냈습니다\./)).toBeVisible();
});

test("signup error surface is rendered", async ({ page }) => {
  await mockSupabaseSignUpError(page, "User already registered");

  await page.goto("/auth/signup");
  await page.getByPlaceholder("you@example.com").fill("qa-signup@example.com");
  await page.locator('input[type="password"]').fill("password123");
  await page.getByRole("button", { name: "계정 만들기" }).click();

  await expect(page.getByText("User already registered")).toBeVisible();
});

test("login happy path redirects to workspace", async ({ page }) => {
  test.slow();
  await mockSupabaseSignInSuccess(page);

  await page.goto("/auth/login");
  await page.getByPlaceholder("you@example.com").fill("qa-login@example.com");
  await page.locator('input[type="password"]').fill("password123");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/workspace$/);
});

test("login invalid credentials shows error", async ({ page }) => {
  test.slow();
  await mockSupabaseSignInError(page, "Invalid login credentials");

  await page.goto("/auth/login");
  await page.getByPlaceholder("you@example.com").fill("qa-login@example.com");
  await page.locator('input[type="password"]').fill("wrong-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page.getByText("Invalid login credentials")).toBeVisible();
});

test("@guard auth guard redirects to /login when auth is enabled and no session", async ({
  page,
}) => {
  test.skip(
    process.env.AUTH_GUARD_E2E !== "1",
    "This test only runs in the dedicated auth-guard E2E lane",
  );

  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login\?redirect=%2Fapp$/, { timeout: 10000 });
});
