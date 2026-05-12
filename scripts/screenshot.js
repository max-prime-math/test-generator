import puppeteer from 'puppeteer';

const url = 'https://max-prime-math.github.io/test-generator/';
const outputPath = 'screenshot.png';

async function takeScreenshot() {
  let browser;
  try {
    browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Set viewport to show the app nicely
    await page.setViewport({ width: 1200, height: 800 });

    // Navigate to the deployed site
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait a moment for any animations to settle
    await page.waitForTimeout(1000);

    // Take the screenshot
    await page.screenshot({ path: outputPath, fullPage: false });

    console.log(`Screenshot saved to ${outputPath}`);
  } catch (error) {
    console.error('Failed to take screenshot:', error);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

takeScreenshot();
