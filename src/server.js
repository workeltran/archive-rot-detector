const express = require('express');
const cors = require('cors');
const axios = require('axios'); 
const fs = require('fs');
const path = require('path'); // Required for serving the public folder

// --- NEW STEALTH REQUIREMENTS ---
// Uses puppeteer-extra and the stealth plugin to hide from bot detection.
const puppeteer = require('puppeteer-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
puppeteer.use(stealth());
// ------------------------------

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json()); 

// --- SERVING THE FRONTEND (MERN-style setup) ---
// This tells Express to serve files (index.html, style.css, script.js)
// from the public folder, which is up one level from src.
app.use(express.static(path.join(__dirname, '../public')));
// -----------------------------------------------

const BATCH_SIZE = 5; // Stable batch size for live checks

// --- Link Type Classification ---
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

// --- Puppeteer Initialization (Single Instance) ---
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

// --- Core Link Checking Logic ---
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
      // Set a robust User-Agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');
      
      let response;
      try {
        // Wait up to 30s for the page to fully load (networkidle2)
        response = await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (pageError) {
         console.error(`Navigation error for ${link.url.substring(0, 40)}...`);
      }

      // Hard 404 Check
      if (response && (response.status() === 404 || response.status() === 410)) {
        throw new Error('HARD_404'); 
      }

      // Get page title and raw HTML for soft 404 checks
      const pageTitle = (await page.title()).toLowerCase();
      const bodyHTML = (await page.evaluate(() => document.body.innerHTML)).toLowerCase();
      
      let isNotFound = false;

      // Twitch Check (Title-based for reliability)
      if (type === 'Twitch VOD/Highlight') {
        if (pageTitle === 'twitch') isNotFound = true;
      
      // YouTube Video Checks (Multiple error strings)
      } else if (type === 'YouTube Video') {
        isNotFound = bodyHTML.includes("video unavailable") || 
                       bodyHTML.includes("this video isn't available anymore") ||
                       bodyHTML.includes("this video is private") ||
                       bodyHTML.includes("this video is unavailable in your country") ||
                       bodyHTML.includes("who has blocked it on copyright grounds");
      
      // YouTube Playlist Checks (Title-based and error strings)
      } else if (type === 'YouTube Playlist') {
        if (pageTitle === 'youtube') {
          isNotFound = true;
        } else {
          isNotFound = bodyHTML.includes("the playlist does not exist") || 
                         bodyHTML.includes("this playlist is unavailable");
        }
      
      // Internet Archive Check
      } else if (type === 'Internet Archive') {
        isNotFound = bodyHTML.includes("this item is not available") ||
                       bodyHTML.includes("the page you are looking for cannot be found");
      }

      result.status = isNotFound ? 'NOT_FOUND' : 'FOUND';

    } else {
      // Simple Generic Check (using fast axios.head)
      await axios.head(link.url, { timeout: 5000 });
      result.status = 'FOUND';
    }

  } catch (error) {
    if (error.message === 'HARD_404' || (error.response && (error.response.status === 404 || error.response.status === 410))) {
      result.status = 'NOT_FOUND';
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      result.status = 'TIMEOUT'; 
    } else {
      result.status = 'ERROR';
    }
  } finally {
    if (page) {
      await page.close(); // Crucial to prevent memory leaks
    }
  }
  
  return result;
}

// --- THE MAIN API ENDPOINT (POST) ---
app.post('/check-links', async (req, res) => {
  console.log('Received POST request to /check-links');

  // Data comes from the frontend text box (req.body)
  const linksToTest = req.body.links;
  if (!linksToTest || !Array.isArray(linksToTest)) {
    return res.status(400).json({ error: 'Invalid JSON. Expected a "links" array.' });
  }

  console.log(`Loaded ${linksToTest.length} links from request body`);
  const allResults = [];
  const browser = await getBrowser();

  // BATCHING LOOP
  for (let i = 0; i < linksToTest.length; i += BATCH_SIZE) {
    const batch = linksToTest.slice(i, i + BATCH_SIZE);
    console.log(`--- Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(linksToTest.length / BATCH_SIZE)} (links ${i + 1} to ${i + batch.length}) ---`);
    
    // Run the batch in parallel, but wait for the whole batch to finish
    const batchResults = await Promise.all(
      batch.map(link => checkLink(link, browser))
    );
    
    allResults.push(...batchResults);
  }

  console.log('Link checking complete. Sending final report.');
  allResults.sort((a, b) => a.id.localeCompare(b.id));
  res.json({ results: allResults });
});

// --- Server Startup and Shutdown ---
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