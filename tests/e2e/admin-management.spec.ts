import { expect, test } from "@playwright/test";

const apiURL = process.env.E2E_API_URL ?? "http://localhost:3000";

test.beforeEach(async ({ request }) => {
  await expect.poll(async () => {
    try {
      return (await request.get(`${apiURL}/health`)).ok();
    } catch {
      return false;
    }
  }, { timeout: 30_000 }).toBe(true);
});

test("admin can edit service, counter, and user records", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Admin")).toBeVisible();

  await page.getByLabel("Ticket retention days").fill("180");
  await page.getByRole("button", { name: "Save retention" }).click();
  await expect(page.getByRole("status")).toContainText("Retention settings updated");
  await expect(page.getByLabel("Ticket retention days")).toHaveValue("180");
  await page.getByRole("button", { name: "Purge old terminal tickets" }).click();
  await expect(page.getByRole("status")).toContainText("0 tickets purged");

  const notificationsPanel = page.locator(".panel", { has: page.getByRole("heading", { name: "Notifications" }) });
  await notificationsPanel.getByLabel("SMTP host").fill("mailpit");
  await notificationsPanel.getByLabel("Email subject").fill("Ticket {{code}} is ready");
  await notificationsPanel.getByLabel("Email body").fill("Track {{code}} for {{serviceName}} at {{ticketUrl}}.");
  await notificationsPanel.getByRole("button", { name: "Save notifications" }).click();
  await expect(page.getByRole("status")).toContainText("Notification settings updated");
  await expect(notificationsPanel.getByLabel("Email subject")).toHaveValue("Ticket {{code}} is ready");

  const branchesPanel = page.locator(".panel", { has: page.getByRole("heading", { name: "Branches" }) });
  await expect(branchesPanel.getByLabel("Manage branch")).toHaveValue(/.+/);

  const priorityService = page.getByRole("form", { name: "Edit service B" });
  await priorityService.getByLabel("Name").fill("Priority Desk");
  await priorityService.getByRole("checkbox", { name: "Active" }).uncheck();
  await priorityService.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Service updated");
  await expect(priorityService.getByLabel("Name")).toHaveValue("Priority Desk");

  const counterTwo = page.getByRole("form", { name: "Edit counter Counter 2" });
  await counterTwo.getByLabel("Name").fill("Back Counter");
  await counterTwo.getByRole("checkbox", { name: "Open" }).uncheck();
  await counterTwo.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Counter updated");
  await expect(page.locator(".record-row", { hasText: "Back Counter" })).toContainText("Closed");

  const usersPanel = page.locator(".panel", { has: page.getByRole("heading", { name: "Users" }) });
  await usersPanel.getByLabel("Name").last().fill("Test Agent");
  await usersPanel.getByLabel("Email").fill("agent@example.com");
  await usersPanel.getByLabel("Password", { exact: true }).fill("agent12345");
  await usersPanel.getByLabel("Role").last().selectOption("AGENT");
  await usersPanel.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByRole("status")).toContainText("User created");

  const agentRow = page.getByRole("form", { name: "Edit user agent@example.com" });
  await agentRow.getByLabel("Name").fill("Branch Lead");
  await agentRow.getByLabel("Role").selectOption("BRANCH_MANAGER");
  await agentRow.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("User updated");
  await expect(agentRow).toContainText("BRANCH_MANAGER");
});
