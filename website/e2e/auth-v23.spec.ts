import { expect, test } from "@playwright/test";

async function openAuthModal(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /login \/ signup/i }).click();
  await expect(page.getByRole("dialog", { name: /welcome back/i })).toBeVisible();
}

test.describe("auth V23.1 UX", () => {
  test("register flow reaches email verification state with mocked Supabase auth", async ({
    page,
  }) => {
    await page.route("**/rest/v1/profiles**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    });
    await page.route("**/auth/v1/signup**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "new-buyer@example.com",
            identities: [],
          },
          session: null,
        }),
      });
    });

    await openAuthModal(page);
    await page.getByRole("button", { name: /^Register$/ }).click();
    await page.getByLabel("Username").fill("buyer_test");
    await page.getByLabel("Email address").fill("new-buyer@example.com");
    await page.getByLabel("Password", { exact: true }).fill("ComePlayers!2026");
    await page.getByLabel("Confirm password").fill("ComePlayers!2026");
    await page.getByLabel(/i agree/i).check();
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByRole("heading", { name: /verify your email/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /resend/i })).toBeVisible();
  });

  test("forgot password sends users through the auth callback URL", async ({ page }) => {
    await page.route("**/auth/v1/recover**", async (route) => {
      const request = route.request();
      expect(request.postData() || "").toContain("/auth/confirm");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });

    await openAuthModal(page);
    await page.getByRole("button", { name: /forgot password/i }).click();
    await page.getByLabel("Email address").fill("buyer@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();

    await expect(page.getByRole("status")).toContainText(/reset link sent/i);
  });

  test("email verification callback verifies token hash and keeps redirect local", async ({
    page,
  }) => {
    await page.route("**/auth/v1/verify**", async (route) => {
      const body = route.request().postDataJSON() as {
        token_hash?: string;
        type?: string;
      };

      expect(body.token_hash).toBe("sample-token");
      expect(body.type).toBe("signup");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "00000000-0000-4000-8000-000000000001" },
          session: null,
        }),
      });
    });

    await page.goto(
      "/auth/confirm?token_hash=sample-token&type=signup&next=https%3A%2F%2Fevil.example%2F"
    );

    await expect(page.getByRole("heading", { name: /email verified/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /continue to comeplayers/i })
    ).toHaveAttribute(
      "href",
      "/"
    );
  });

  test("an existing authenticated account skips the verification welcome screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.setItem("comeplayers_remember_me", "true");
      window.localStorage.setItem(
        "sb-uyehruetoxedmookyfcd-auth-token",
        JSON.stringify({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 4102444800,
          user: {
            id: "00000000-0000-4000-8000-000000000099",
            aud: "authenticated",
            role: "authenticated",
            email: "existing-buyer@example.com",
            email_confirmed_at: "2026-01-01T00:00:00.000Z",
            app_metadata: { provider: "email", providers: ["email"] },
            user_metadata: {},
            identities: [],
            created_at: "2025-01-01T00:00:00.000Z",
          },
        })
      );
    });

    await page.goto("/auth/confirm?next=%2Fcpcommunity");

    await expect(page).toHaveURL(/\/cpcommunity$/);
    await expect(
      page.getByRole("heading", { name: /email verified/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /verifying email/i })
    ).toHaveCount(0);
  });

  test("reset password page exposes accessible recovery feedback", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: /reset password/i })).toBeVisible();
    await expect(page.getByRole("status").or(page.getByRole("alert"))).toBeVisible();
  });
});
