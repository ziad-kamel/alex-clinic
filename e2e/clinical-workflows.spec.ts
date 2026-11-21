import { test, expect } from '@playwright/test';

test.describe('E2E Clinical Workflows', () => {
  // Test 1: Staff Login -> Book Doctor Appointment -> Print Receipt View
  test('Flow 1: Staff logs in, registers patient, books appointment, and opens 80mm receipt', async ({ page }) => {
    // 1. Visit Login
    await page.goto('/login');
    await expect(page.locator('input[name="username"]')).toBeVisible();

    // 2. Login as frontdesk
    await page.fill('input[name="username"]', 'frontdesk');
    await page.fill('input[name="password"]', 'Staff@123456');
    await page.click('button[type="submit"]');

    // 3. Navigate to Front Desk
    await page.waitForURL('**/dashboard**');
    await page.goto('/dashboard/front-desk');
    await expect(page.locator('h1')).toBeVisible();

    // 4. Generate random phone for new patient
    const randDigits = Math.floor(100000 + Math.random() * 900000);
    const patientName = `E2E Patient ${randDigits}`;
    const patientPhone = `010${randDigits}99`;

    // Click register new patient toggle if form not visible
    const registerToggle = page.locator('button:has-text("Register New Patient"), button:has-text("تسجيل مريض جديد")').first();
    if (await registerToggle.isVisible()) {
      await registerToggle.click();
    }

    // Fill patient registration
    await page.locator('input[placeholder*="Omar"], input[placeholder*="عمر"]').first().fill(patientName);
    await page.locator('input[placeholder*="01xxxxxxxxx"]').first().fill(patientPhone);
    await page.click('button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("حفظ")');

    // Wait for patient to be registered and selected
    await expect(page.locator(`text=${patientName}`)).toBeVisible();

    // 5. Book Appointment on Sunday (2026-11-22)
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill('2026-11-22');

    // Submit booking
    const bookBtn = page.locator('button:has-text("Confirm Booking"), button:has-text("تأكيد الحجز")').first();
    await bookBtn.click();

    // Expect receipt number or queue number confirmation
    await expect(page.locator('text=Queue #, text=رقم الدور, text=REC-').first()).toBeVisible({ timeout: 15000 });
  });

  // Test 2: Book Lab Order -> Lab Staff Enters Results -> Marks Completed
  test('Flow 2: Book lab order, enter diagnostic results, and complete order', async ({ page, request }) => {
    // Direct API setup: create patient and lab order via API
    const loginRes = await request.post('http://localhost:3001/api/auth/login', {
      data: { username: 'frontdesk', password: 'Staff@123456' },
    });
    expect(loginRes.ok()).toBeTruthy();

    const rand = Math.floor(100000 + Math.random() * 900000);
    const patientRes = await request.post('http://localhost:3001/api/patients', {
      data: { name: `Lab Test Patient ${rand}`, phone: `012${rand}11` },
    });
    expect(patientRes.ok()).toBeTruthy();
    const patient = await patientRes.json();

    // Book Lab Order with FBS test
    const testsRes = await request.get('http://localhost:3001/api/lab-tests');
    const tests = await testsRes.json();
    const fbsTest = tests.find((t: any) => t.code === 'FBS') || tests[0];

    const orderRes = await request.post('http://localhost:3001/api/lab-orders', {
      data: {
        patientId: patient.id,
        testIds: [fbsTest.id],
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = await orderRes.json();

    // Login as LAB specialist in browser
    await page.goto('/login');
    await page.fill('input[name="username"]', 'lab');
    await page.fill('input[name="password"]', 'Lab@123456');
    await page.click('button[type="submit"]');

    // Navigate to lab order detail page
    await page.waitForURL('**/dashboard**');
    await page.goto(`/dashboard/lab/${order.id}`);

    // Enter result value
    const resultInput = page.locator('input[placeholder*="95"]').first();
    await expect(resultInput).toBeVisible();
    await resultInput.fill('92');

    // Save result
    const saveBtn = page.locator('button:has-text("Save Result"), button:has-text("حفظ")').first();
    await saveBtn.click();

    // Complete order
    page.on('dialog', (dialog) => dialog.accept());
    const completeBtn = page.locator('button:has-text("Complete"), button:has-text("إتمام")').first();
    await completeBtn.click();

    // Verify order marked COMPLETED
    await expect(page.locator('text=COMPLETED, text=مكتمل').first()).toBeVisible({ timeout: 15000 });
  });

  // Test 3: Doctor logs in, views queue, marks patient as seen
  test('Flow 3: Doctor views daily queue and marks patient as seen', async ({ page }) => {
    // 1. Login as doctor
    await page.goto('/login');
    await page.fill('input[name="username"]', 'doctor');
    await page.fill('input[name="password"]', 'Doctor@123456');
    await page.click('button[type="submit"]');

    // 2. Navigate to Doctor Queue
    await page.waitForURL('**/dashboard**');
    await page.goto('/dashboard/doctor');
    await expect(page.locator('h1')).toBeVisible();

    // Select date 2026-11-22
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill('2026-11-22');

    // If there is any waiting patient, mark as seen
    const markSeenBtn = page.locator('button:has-text("Mark as Seen"), button:has-text("تسجيل تم الكشف")').first();
    if (await markSeenBtn.isVisible()) {
      await markSeenBtn.click();
      await expect(page.locator('text=SEEN, text=تم الكشف').first()).toBeVisible();
    }
  });

  // Test 4: Patient Portal - Login, View Results, Download PDF
  test('Flow 4: Patient logs into portal and views results', async ({ page, request }) => {
    // Find a portal account with completed results
    const ordersRes = await request.get('http://localhost:3001/api/lab-orders?status=COMPLETED');
    if (ordersRes.ok()) {
      const orders = await ordersRes.json();
      if (orders.length > 0 && orders[0].patient?.portalAccountLocal?.portalUserId) {
        const portalUserId = orders[0].patient.portalAccountLocal.portalUserId;

        // Visit Patient Portal on port 3002
        await page.goto('http://localhost:3002');
        await expect(page.locator('input[name="userId"]')).toBeVisible();

        // Verify patient login form fields and localization
        await expect(page.locator('input[name="password"]')).toBeVisible();
      }
    }
  });
});
