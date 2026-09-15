const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser to demonstrate the flow...');
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 390, height: 844 },
    args: ['--window-size=400,900']
  });
  
  const page = await browser.newPage();
  
  // Helper for delays
  const delay = ms => new Promise(res => setTimeout(res, ms));

  try {
    await page.goto('http://localhost:3000');
    await delay(1000);

    // 1. Sign Up
    console.log('Signing up...');
    await page.type('#authName', 'Boss Test');
    await page.type('#authEmail', `boss${Date.now()}@test.com`);
    await delay(500);
    // Click Sign Up toggle first
    await page.evaluate(() => {
      document.querySelector('.auth-toggle').click();
    });
    await delay(500);
    await page.evaluate(() => {
      document.querySelector('#btnAuthSubmit').click();
    });
    await delay(2000); // Wait for login

    // 2. Click Create Template
    console.log('Creating a template...');
    await page.evaluate(() => document.querySelector('#btnCreateTemplate').click());
    await delay(1000);

    // Fill form
    await page.type('#teVenueName', 'MADISON SQUARE GARDEN');
    await page.type('#teEventTitle', 'TEST EVENT 2026');
    await page.type('#teSection', '101');
    await page.type('#teRow', 'A');
    await page.type('#teNumSeats', '2');
    
    // Set a date
    await page.type('#teEventDate', '2026-12-31');
    await delay(500);

    // Submit form
    await page.evaluate(() => document.querySelector('#btnEditorSave').click());
    await delay(2000);

    // 3. Activate the new template
    console.log('Activating template...');
    await page.evaluate(() => {
      const activateBtns = document.querySelectorAll('.dash-template-btn.activate');
      if (activateBtns.length > 0) {
        activateBtns[activateBtns.length - 1].click();
      }
    });
    await delay(2000);

    // 4. Go to My Tickets tab
    console.log('Switching to My Tickets tab...');
    await page.evaluate(() => document.querySelector('#tabMyTickets').click());
    await delay(2000);

    // 5. Click View Ticket
    console.log('Clicking View Ticket...');
    await page.evaluate(() => {
      const viewTicketBtns = document.querySelectorAll('.card-view-ticket-btn');
      if (viewTicketBtns.length > 0) {
        // The first one is probably the active ticket
        viewTicketBtns[0].click();
      }
    });
    await delay(2000);

    // 6. Select the Template from the list
    console.log('Selecting Template from Modal...');
    await page.evaluate(() => {
      const templateItems = document.querySelectorAll('.ts-item');
      if (templateItems.length > 0) {
        templateItems[0].click();
      }
    });
    await delay(3000);

    console.log('Demonstration complete! Keeping browser open for 10 seconds...');
    await delay(10000);

  } catch (err) {
    console.error('Error during automation:', err);
  } finally {
    await browser.close();
  }
})();
