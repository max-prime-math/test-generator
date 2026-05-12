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
    console.log('Creating screenshots directory...');
    if (!fs.existsSync('screenshots')) {
      fs.mkdirSync('screenshots');
      console.log('✓ Created screenshots directory');
    } else {
      console.log('✓ Screenshots directory already exists');
    }

    console.log('Launching browser...');
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✓ Browser launched');

    const page = await browser.newPage();
    console.log('✓ New page created');

    // Set viewport to show the app nicely
    await page.setViewport({ width: 1200, height: 800 });
    console.log('✓ Viewport set to 1200x800');

    // Navigate to the deployed site
    console.log(`Navigating to ${baseUrl}...`);
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    console.log('✓ Page loaded');

    // Disable tutorial and load sample questions
    console.log('Configuring demo environment...');
    await page.evaluate(() => {
      localStorage.setItem('tg-tutorial-done-v1', 'true');

      // Load sample questions
      const sampleQuestions = [
        {
          id: 'demo-1',
          body: 'Find the derivative of $f(x) = x^3 - 2x^2 + 5x - 1$.',
          points: 5,
          solution: '$f\'(x) = 3x^2 - 4x + 5$',
          tags: ['derivatives', 'calculus'],
          choices: null,
          createdAt: Date.now(),
          unit: '1',
          section: '1',
          classId: 'Calculus'
        },
        {
          id: 'demo-2',
          body: 'What is $lim_(x -> 0) frac(sin x, x)$?',
          points: 4,
          choices: { A: '$0$', B: '$1$', C: '$infinity$', D: 'Does not exist' },
          solution: 'B',
          tags: ['limits', 'trigonometry'],
          createdAt: Date.now(),
          unit: '1',
          section: '2',
          classId: 'Calculus'
        },
        {
          id: 'demo-3',
          body: 'Solve the equation: $2x^2 - 5x + 3 = 0$',
          points: 3,
          solution: '$x = 1$ or $x = frac(3, 2)$',
          tags: ['algebra', 'quadratic'],
          choices: null,
          createdAt: Date.now(),
          unit: '2',
          section: '1',
          classId: 'Algebra'
        },
        {
          id: 'demo-4',
          body: 'Evaluate $ integral_0^1 x^2 dif x $.',
          points: 5,
          choices: { A: '$frac(1, 2)$', B: '$frac(1, 3)$', C: '$frac(1, 4)$', D: '$1$' },
          solution: 'B',
          tags: ['integration', 'calculus'],
          createdAt: Date.now(),
          unit: '1',
          section: '3',
          classId: 'Calculus'
        }
      ];

      localStorage.setItem('questions', JSON.stringify(sampleQuestions));
    });
    console.log('✓ Tutorial disabled and sample questions loaded');

    // Reload to apply the settings
    await page.reload({ waitUntil: 'networkidle2' });
    console.log('✓ Page reloaded with demo data');

    // Wait for app to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 1. Question Bank (with a question selected to show preview)
    console.log('📸 Capturing: Question Bank');
    // Click on the second question to show the preview pane
    await page.evaluate(() => {
      const questionCards = Array.from(document.querySelectorAll('[class*="card"]'));
      // Find and click the second question card
      const secondCard = questionCards.find(card => card.textContent.includes('lim_'));
      secondCard?.click();
    });
    await new Promise(resolve => setTimeout(resolve, 800)); // Wait for preview to render
    await page.screenshot({ path: 'screenshots/question-bank.png', fullPage: false });
    console.log('✓ Saved: screenshots/question-bank.png');

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
      console.log('✓ Saved: screenshots/editor.png');
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
      console.log('✓ Saved: screenshots/build-test.png');
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
      console.log('✓ Saved: screenshots/bulk-import.png');
      // Close dialog
      await page.keyboard.press('Escape');
    } catch (e) {
      console.warn('⚠️  Could not capture bulk import screenshot:', e.message);
    }

    console.log('✅ All screenshots completed');
    console.log('Checking for created files...');
    const files = fs.readdirSync('screenshots');
    console.log(`Found ${files.length} files:`, files);
  } catch (error) {
    console.error('Failed to take screenshots:', error);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

takeScreenshots();
