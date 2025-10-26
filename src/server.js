const express = require('express');
const cors = require('cors');
const axios = require('axios'); 
const fs = require('fs');
const path = require('path'); 

// stealth
const puppeteer = require('puppeteer-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
puppeteer.use(stealth());

// port setup
const app = express();
const PORT = 8000; 

// express middleware
app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname, '../public')));

const BATCH_SIZE = 5; 

// classify link type
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

// checks links
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
        response = await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (pageError) {
        throw pageError;
      }

      // Hard 404 Check
      if (response && (response.status() === 404 || response.status() === 410)) {
        throw new Error('HARD_404'); 
      }

      // get the page content
      const pageTitle = (await page.title()).toLowerCase();
      const bodyHTML = (await page.evaluate(() => document.body.innerHTML)).toLowerCase();
      
      let isNotFound = false;

      // check Twitch links
      if (type === 'Twitch VOD/Highlight') {
        if (pageTitle === 'twitch') isNotFound = true;
      
      } // check YouTube links
       else if (type === 'YouTube Video') {
        // This is the ultimate list of strings we know exist for dead content
        isNotFound = (pageTitle === 'youtube') || // generic 404
                       bodyHTML.includes("video unavailable") || // generic unavailability
                       bodyHTML.includes("this video isn't available anymore") || // deletion
                       bodyHTML.includes("this video is private") || // privacy
                       bodyHTML.includes("this video is unavailable in your country") || // rregional block
                       bodyHTML.includes("who has blocked it on copyright grounds") || // copyright block
                       bodyHTML.includes("has been removed by the user") || // user removal
                       bodyHTML.includes("account associated with this video has been terminated"); // channel termination

      // YouTube playlist Checks
      } else if (type === 'YouTube Playlist') {
        if (pageTitle === 'youtube') {
          isNotFound = true;
        } else {
          isNotFound = bodyHTML.includes("the playlist does not exist") || 
                         bodyHTML.includes("this playlist is unavailable");
        }
      
      // Internet Archive check
      } else if (type === 'Internet Archive') {
        isNotFound = bodyHTML.includes("this item is not available") ||
                       bodyHTML.includes("the page you are looking for cannot be found");
      }

      result.status = isNotFound ? 'NOT_FOUND' : 'FOUND';

    } else {
      // generic check
      await axios.head(link.url, { timeout: 5000 });
      result.status = 'FOUND';
    }

  } catch (error) {
    // can't find the link
    if (error.message === 'HARD_404' || (error.response && (error.response.status === 404 || error.response.status === 410))) {
      result.status = 'NOT_FOUND';
    } 
    // timeout or network error
    else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      result.status = 'TIMEOUT'; 
    } 
    // unexpected errors
    else {
      result.status = 'ERROR';
    }
  } 
  // ensure page is closed
  finally {
    if (page) {
      await page.close(); 
    }
  }
  
  return result;
}

//  main API endpoint
app.post('/check-links', async (req, res) => {
  console.log('Received POST request to /check-links');

  const linksToTest = req.body.links;
  if (!linksToTest || !Array.isArray(linksToTest)) {
    return res.status(400).json({ error: 'Invalid JSON. Expected a "links" array.' });
  }

  console.log(`Loaded ${linksToTest.length} links from request body`);
  const allResults = [];

  // launches and closes browser for fixed size batches to reduce memory leaks
  for (let i = 0; i < linksToTest.length; i += BATCH_SIZE) {
    let browser; 
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const batch = linksToTest.slice(i, i + BATCH_SIZE);
        console.log(`--- Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(linksToTest.length / BATCH_SIZE)} (links ${i + 1} to ${i + batch.length}) ---`);
        
        const batchResults = await Promise.all(
          batch.map(link => checkLink(link, browser))
        );
        
        allResults.push(...batchResults);

    } catch (e) {
        console.error("Fatal error during batch processing:", e);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
  }

  // report done
  console.log('Link checking complete. Sending final report.');
  allResults.sort((a, b) => a.id.localeCompare(b.id));
  res.json({ results: allResults });
});

// start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});