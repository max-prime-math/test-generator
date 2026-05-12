import puppeteer from 'puppeteer';

const baseUrl = 'https://max-prime-math.github.io/test-generator/';

function findButton(text) {
  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.find(b => b.textContent.includes(text));
}

async function takeScreenshots() {
  let browser;
  try {
    // Create screenshots directory if it doesn't exist
    const fs = await import('fs');
    if (!fs.existsSync('screenshots')) {
      fs.mkdirSync('screenshots');
    }

    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set viewport to show the app nicely
    await page.setViewport({ width: 1200, height: 800 });

    // Navigate to the deployed site
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });

    // Wait for app to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 1. Question Bank (default view)
    console.log('📸 Capturing: Question Bank');
    await page.screenshot({ path: 'screenshots/question-bank.png', fullPage: false });

    // 2. Question Editor (click "Add Question")
    console.log('📸 Capturing: Question Editor');
    try {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.includes('Add Question')
        );
        btn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 800));
      await page.screenshot({ path: 'screenshots/editor.png', fullPage: false });
      // Close editor
      await page.keyboard.press('Escape');
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      console.warn('⚠️  Could not capture editor screenshot:', e.message);
    }

    // 3. Build Test view (click "Build Test" tab)
    console.log('📸 Capturing: Build Test');
    try {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.includes('Build Test')
        );
        btn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      await page.screenshot({ path: 'screenshots/build-test.png', fullPage: false });
      // Go back to bank
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.includes('Question Bank')
        );
        btn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (e) {
      console.warn('⚠️  Could not capture build test screenshot:', e.message);
    }

    // 4. Bulk Import dialog
    console.log('📸 Capturing: Bulk Import');
    try {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.toLowerCase().includes('bulk') || b.textContent.toLowerCase().includes('import')
        );
        btn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 800));
      await page.screenshot({ path: 'screenshots/bulk-import.png', fullPage: false });
      // Close dialog
      await page.keyboard.press('Escape');
    } catch (e) {
      console.warn('⚠️  Could not capture bulk import screenshot:', e.message);
    }

    console.log('✅ Screenshots captured successfully');
  } catch (error) {
    console.error('Failed to take screenshots:', error);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

takeScreenshots();
