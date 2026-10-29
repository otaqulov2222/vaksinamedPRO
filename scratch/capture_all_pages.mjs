import puppeteer from "puppeteer";

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://77.83.206.192/admin/", { waitUntil: "networkidle0" });
  
  const isLoginPage = await page.$('input[type="email"]');
  if (isLoginPage) {
    await page.type('input[type="email"]', "admin@vaksinamed.uz");
    await page.type('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0" });
  }
  
  await new Promise((r) => setTimeout(r, 1000));
  
  const artifactDir = "C:/Users/UltraPC/.gemini/antigravity/brain/a3479d8e-d211-4fa7-b63e-877e04888cfe";

  // Helper to click sidebar nav items by label
  async function goToNav(label) {
    const navItems = await page.$$(".nav-item");
    for (const item of navItems) {
      const text = await (await item.getProperty("innerText")).jsonValue();
      if (text.includes(label)) {
        await item.click();
        await new Promise((r) => setTimeout(r, 1000));
        return true;
      }
    }
    return false;
  }

  // 1. Settings
  console.log("Navigating to Sozlamalar...");
  await goToNav("Sozlamalar");
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${artifactDir}/live_vps_settings_fixed.png` });

  // 2. Reports
  console.log("Navigating to Hisobotlar...");
  await goToNav("Hisobotlar");
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${artifactDir}/live_vps_reports_fixed.png` });

  // 3. Audit
  console.log("Navigating to Audit...");
  await goToNav("Audit");
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${artifactDir}/live_vps_audit_fixed.png` });

  // 4. Adminlar
  console.log("Navigating to Adminlar...");
  await goToNav("Adminlar");
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${artifactDir}/live_vps_admins_fixed.png` });

  await browser.close();
  console.log("All screenshots captured successfully!");
}

run().catch(console.error);
