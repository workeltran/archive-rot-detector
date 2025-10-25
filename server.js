const express = require('express');
const cors = require('cors');
const axios = require('axios'); 
const puppeteer = require('puppeteer'); 
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

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

app.get('/check-links', async (req, res) => {
  console.log('Received request to /check-links with Puppeteer');

  let linksToTest = [];
  try {
    const data = fs.readFileSync('test-sample.json', 'utf8');
    linksToTest = JSON.parse(data);
    console.log(`Loaded ${linksToTest.length} links from test-sample.json`);
  } catch (err) {
    console.error('Error reading test-sample.json:', err);
    return res.status(500).json({ error: 'Could not read test-sample.json' });
  }

  const results = [];
  const browser = await getBrowser();

  await Promise.all(
    linksToTest.map(async (link) => {
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
             console.error(`Navigation error for ${link.url}: ${pageError.message}`);
          }

          if (response && (response.status() === 404 || response.status() === 410)) {
            throw new Error('HARD_404'); 
          }

          // --- WE NOW GET BOTH HTML AND TEXT ---
          const bodyHTML = (await page.evaluate(() => document.body.innerHTML)).toLowerCase();
          const bodyText = (await page.evaluate(() => document.body.innerText)).toLowerCase();
          // ------------------------------------
          
          let isNotFound = false;

          // --- Use the correct variable for each site ---
          if (type === 'Twitch VOD/Highlight') {
            isNotFound = bodyText.includes("sorry. unless you've got a time machine, that content is unavailable");
          
          } else if (type === 'YouTube Video') {
            isNotFound = bodyHTML.includes("video unavailable") || 
                           bodyHTML.includes("this video isn't available anymore") ||
                           bodyHTML.includes("this video is private") ||
                           bodyHTML.includes("this video is unavailable in your country") ||
                           bodyHTML.includes("who has blocked it on copyright grounds");
          
          } else if (type === 'YouTube Playlist') {
            isNotFound = bodyHTML.includes("the playlist does not exist") || 
                           bodyHTML.includes("this playlist is unavailable");
          
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
          result.status = 'TIMEOUT';
        } else {
          result.status = 'ERROR';
        }
      } finally {
        if (page) {
          await page.close(); 
        }
      }
      
      results.push(result);
    })
  );

  console.log('Link checking complete with Puppeteer.');
  results.sort((a, b) => a.id.localeCompare(b.id));
  res.json({ results: results });
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