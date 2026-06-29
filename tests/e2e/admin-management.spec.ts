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
  await expect(page).toHaveTitle("Admin | QMS");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Admin")).toBeVisible();
  const branchesPanel = page.locator(".panel", { has: page.getByRole("heading", { name: "Branches" }) });
  await expect(branchesPanel.getByLabel("Manage branch")).toHaveValue(/.+/);

  const todayPanel = page.locator(".panel", { has: page.getByRole("heading", { name: "Today" }) });
  const today = new Date().toISOString().slice(0, 10);
  const analyticsBranch = todayPanel.getByLabel("Analytics branch");
  await analyticsBranch.selectOption({ index: 1 });
  const selectedAnalyticsBranchId = await analyticsBranch.inputValue();
  await todayPanel.getByLabel("Start date").fill(today);
  await todayPanel.getByLabel("End date").fill(today);
  await todayPanel.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("status")).toContainText("Analytics filters applied");
  await expect(todayPanel.getByRole("table", { name: "Branch dashboard" })).toContainText("Main Branch");
  const exportHref = await todayPanel.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  expect(exportHref).toContain(`start=${today}`);
  expect(exportHref).toContain(`end=${today}`);
  expect(exportHref).toContain(`branchId=${selectedAnalyticsBranchId}`);

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

  const appointmentsPanel = page.locator(".panel", { has: page.getByRole("heading", { name: "Appointments" }) });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await appointmentsPanel.getByLabel("Service").selectOption({ index: 0 });
  await appointmentsPanel.getByLabel("Appointment time").fill(`${tomorrow}T10:30`);
  await appointmentsPanel.getByLabel("Name").fill("Mona Appointment");
  await appointmentsPanel.getByLabel("Email").fill("mona@example.com");
  await appointmentsPanel.getByLabel("Phone").fill("+97455551234");
  await appointmentsPanel.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByRole("status")).toContainText("Appointment scheduled");
  await expect(appointmentsPanel.getByLabel("Upcoming appointments")).toContainText("Mona Appointment");

  const priorityService = page.getByRole("form", { name: "Edit service B" });
  await priorityService.getByLabel("Name").fill("Priority Desk");
  await priorityService.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Service updated");
  await expect(priorityService.getByLabel("Name")).toHaveValue("Priority Desk");

  const counterTwo = page.getByRole("form", { name: "Edit counter Counter 2" });
  await counterTwo.getByLabel("Name").fill("Back Counter");
  await counterTwo.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Counter updated");
  await expect(page.getByRole("form", { name: "Edit counter Back Counter" }).getByLabel("Name")).toHaveValue("Back Counter");

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
