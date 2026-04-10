const puppeteer = require("puppeteer-core");
(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.goto("http://127.0.0.1:28902/", { waitUntil: "networkidle2" });
  await page.waitForSelector("#doctorToggleBtn");
  await page.click("#doctorToggleBtn");
  await page.waitForFunction(() => {
    const text = document.body?.innerText || "";
    return text.includes("Deployment Backends") || text.includes("部署");
  }, { timeout: 15000 });
  const result = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll("div"));
    const card = blocks.find((el) => (el.textContent || "").includes("Deployment Backends"));
    return {
      pageTitle: document.title,
      doctorVisible: Boolean(document.querySelector("#doctorStatus") && !document.querySelector("#doctorStatus")?.classList.contains("hidden")),
      cardText: card ? (card.textContent || "").replace(/\s+/g, " ").trim() : null,
      bodySnippet: document.body?.innerText?.slice(0, 4000) || "",
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
