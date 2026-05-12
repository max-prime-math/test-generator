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

      // Load sample questions with proper curriculum structure
      const sampleQuestions = [
        {
          id: 'demo-1',
          body: 'Find the derivative of $f(x) = x^3 - 2x^2 + 5x - 1$.',
          points: 5,
          solution: '$f\'(x) = 3x^2 - 4x + 5$',
          tags: ['derivatives', 'calculus'],
          choices: null,
          createdAt: Date.now(),
          classId: 'ap-calc-bc',
          unitId: '2',
          sectionId: '2.1'
        },
        {
          id: 'demo-2',
          body: 'What is $lim_(x -> 0) frac(sin x, x)$?',
          points: 4,
          choices: { A: '$0$', B: '$1$', C: '$infinity$', D: 'Does not exist' },
          answer: 'B',
          solution: 'The standard limit equals 1.',
          tags: ['limits', 'trigonometry'],
          createdAt: Date.now(),
          classId: 'ap-calc-bc',
          unitId: '1',
          sectionId: '1.1'
        },
        {
          id: 'demo-3',
          body: 'Solve the equation: $2x^2 - 5x + 3 = 0$',
          points: 3,
          solution: '$x = 1$ or $x = frac(3, 2)$',
          tags: ['algebra', 'quadratic'],
          choices: null,
          createdAt: Date.now(),
          classId: 'algebra-1',
          unitId: '3',
          sectionId: '3.2'
        },
        {
          id: 'demo-4',
          body: 'Evaluate $ integral_0^1 x^2 dif x $.',
          points: 5,
          choices: { A: '$frac(1, 2)$', B: '$frac(1, 3)$', C: '$frac(1, 4)$', D: '$1$' },
          answer: 'B',
          solution: 'Using the power rule for integration.',
          tags: ['integration', 'calculus'],
          createdAt: Date.now(),
          classId: 'ap-calc-bc',
          unitId: '2',
          sectionId: '2.3'
        }
      ];

      localStorage.setItem('math-test-bank-v2', JSON.stringify(sampleQuestions));
      console.log('Sample questions saved:', sampleQuestions.length);
    });
    console.log('✓ Tutorial disabled and sample questions loaded');

    // Reload to apply the settings
    await page.reload({ waitUntil: 'networkidle2' });
    console.log('✓ Page reloaded with demo data');

    // Wait for app to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 1. Question Bank (with a question selected to show preview)
    console.log('📸 Capturing: Question Bank');

    // Wait for questions to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Debug: check what questions loaded
    const questionCount = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card'));
      console.log('Found cards:', cards.length);
      return cards.length;
    });
    console.log(`Questions loaded: ${questionCount}`);

    // Hide the left sidebar by finding the collapse button/divider
    await page.evaluate(() => {
      // Look for any clickable element that might collapse the sidebar
      // Try finding a button or handle in the sidebar area
      const sidebarElements = Array.from(document.querySelectorAll('[class*="sidebar"], [class*="panel"], [class*="resizable"]'));
      console.log('Sidebar elements found:', sidebarElements.length);

      // Try to find and click a collapse/hide button
      const buttons = Array.from(document.querySelectorAll('button'));
      const collapseBtn = buttons.find(btn => {
        const text = btn.textContent.toLowerCase();
        return text.includes('collapse') || text.includes('hide') || btn.title?.includes('collapse');
      });
      if (collapseBtn) {
        console.log('Found collapse button, clicking...');
        collapseBtn.click();
      }
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Click on the second question card to show the preview pane
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card'));
      console.log('Cards available for clicking:', cards.length);
      if (cards.length > 1) {
        cards[1].click();
      } else if (cards.length > 0) {
        cards[0].click();
      }
    });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for preview to render
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

    // 3. Build Test view (click "Build Test" tab and select some questions)
    console.log('📸 Capturing: Build Test');
    try {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.includes('Build Test')
        );
        btn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Select a few questions by clicking checkboxes in the picker
      await page.evaluate(() => {
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        // Select the first 3 questions
        checkboxes.slice(0, 3).forEach(cb => {
          if (!cb.checked) {
            cb.click();
          }
        });
      });
      await new Promise(resolve => setTimeout(resolve, 500));

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
