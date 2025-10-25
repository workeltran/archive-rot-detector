const express = require('express');
const cors = require('cors');
const axios = require('axios'); 
const puppeteer = require('puppeteer'); 
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- THIS IS OUR NEW BATCH SIZE ---
// We will only run 10 checks at a time.
const BATCH_SIZE = 10;
// ---------------------------------

function getLinkType(url) {
  if (url.includes('youtube.com/playlist') || url.includes('youtube.com/playlist')) {
    return 'YouTube Playlist';
  }
  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
    return 'YouTube Video';
  }
  if (url.includes('twitch.tv/videos/')) {
    return 'Twitch VOD/Highlight';
  }
  if (url.includes('archive.org/details/')) { 
    return 'Internet Archive';
  }
  return 'Generic';
}

let browserInstance;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserInstance;
}

// --- I've moved the logic into its own function ---
async function checkLink(link, browser) {
  const type = getLinkType(link.url);
  const result = { id: link.id, url: link.url, type: type, status: 'PENDING' };
  let page; 

  try {
    if (
      type === 'Twitch VOD/Highlight' ||
      type === 'YouTube Video' ||
      type === 'YouTube Playlist' ||
      type === 'Internet Archive'
    ) {
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');
      
      let response;
      try {
        response = await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 10000 });
      } catch (pageError) {
         // This is the error you saw in the console. It's now expected.
         console.error(`Navigation error for ${link.url.substring(0, 40)}...`);
      }

      if (response && (response.status() === 404 || response.status() === 410)) {
        throw new Error('HARD_404'); 
      }

      const pageTitle = (await page.title()).toLowerCase();
      const bodyHTML = (await page.evaluate(() => document.body.innerHTML)).toLowerCase();
      
      let isNotFound = false;

      if (type === 'Twitch VOD/Highlight') {
        if (pageTitle === 'twitch') isNotFound = true;
      
      } else if (type === 'YouTube Video') {
        isNotFound = bodyHTML.includes("video unavailable") || 
                       bodyHTML.includes("this video isn't available anymore") ||
                       bodyHTML.includes("this video is private") ||
                       bodyHTML.includes("this video is unavailable in your country") ||
                       bodyHTML.includes("who has blocked it on copyright grounds");
      
      } else if (type === 'YouTube Playlist') {
        if (pageTitle === 'youtube') {
          isNotFound = true;
        } else {
          isNotFound = bodyHTML.includes("the playlist does not exist") || 
                         bodyHTML.includes("this playlist is unavailable");
        }
      
      } else if (type === 'Internet Archive') {
        isNotFound = bodyHTML.includes("this item is not available") ||
                       bodyHTML.includes("the page you are looking for cannot be found");
      }

      result.status = isNotFound ? 'NOT_FOUND' : 'FOUND';

    } else {
      await axios.head(link.url, { timeout: 5000 });
      result.status = 'FOUND';
    }

  } catch (error) {
    if (error.message === 'HARD_404' || (error.response && (error.response.status === 404 || error.response.status === 410))) {
      result.status = 'NOT_FOUND';
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      result.status = 'TIMEOUT'; // This is now an expected status, not an error
    } else {
      result.status = 'ERROR';
    }
  } finally {
    if (page) {
      await page.close(); 
    }
  }
  
  return result;
}
// ------------------------------------------

app.get('/check-links', async (req, res) => {
  console.log('Received request to /check-links with Puppeteer (BATCHED)');

  let linksToTest = [];
  try {
    // Make sure this is reading 'input-links.json'
    const data = fs.readFileSync('input-links.json', 'utf8');
    linksToTest = JSON.parse(data);
    console.log(`Loaded ${linksToTest.length} links from input-links.json`);
  } catch (err) {
    console.error('Error reading input-links.json:', err);
    return res.status(500).json({ error: 'Could not read input-links.json' });
  }

  const allResults = [];
  const browser = await getBrowser();

  // --- THIS IS THE NEW BATCHING LOOP ---
  for (let i = 0; i < linksToTest.length; i += BATCH_SIZE) {
    const batch = linksToTest.slice(i, i + BATCH_SIZE);
    console.log(`--- Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(linksToTest.length / BATCH_SIZE)} (links ${i + 1} to ${i + batch.length}) ---`);
    
    const batchResults = await Promise.all(
      batch.map(link => checkLink(link, browser))
    );
    
    allResults.push(...batchResults);
  }
  // -------------------------------------

  console.log('Link checking complete.');
  allResults.sort((a, b) => a.id.localeCompare(b.id));
  res.json({ results: allResults });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

process.on('exit', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
});

process.on('SIGINT', async () => { 
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit();
});