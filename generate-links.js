const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// The one, anonymized CSV file.
const csvFile = 'data-source.csv';

// Columns to check for links - UPDATED to only check 'VOD Link'
const linkColumns = ['VOD Link'];

const allLinks = new Set();
// Regex to split by http/https. Uses a positive lookahead (?=...)
// to split *before* the 'http' but keep it as part of the string.
const linkSplitRegex = /(?=https?:\/\/)/g; 

async function processFile() {
  console.log('Starting link extraction from data-source.csv (VOD Link column ONLY)...');

  if (!fs.existsSync(csvFile)) {
    console.error(`Error: File not found: ${csvFile}`);
    console.log('Please make sure "data-source.csv" is in the project root.');
    return;
  }

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvFile)
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim() // Clean up header names
      }))
      .on('data', (row) => {
        for (const col of linkColumns) {
          if (row[col]) {
            // Cell might have multiple links concatenated.
            // Use the regex to split the text block by 'http' or 'https.
            const linksInCell = row[col].split(linkSplitRegex);
            
            linksInCell.forEach(link => {
              const trimmedLink = link.trim();
              // Add to set if it's a valid-looking HTTP/S link
              if (trimmedLink.startsWith('http')) {
                allLinks.add(trimmedLink);
              }
            });
          }
        }
      })
      .on('end', () => {
        resolve();
      })
      .on('error', (error) => {
        console.error(`Error processing ${csvFile}:`, error.message);
        reject(error);
      });
  });

  console.log(`Found ${allLinks.size} unique links.`);

  // Convert the Set of links into the final JSON structure
  const formattedLinks = Array.from(allLinks).map((link, index) => ({
    id: `link_${index + 1}`,
    url: link
  }));

  // Write the final JSON file
  fs.writeFileSync('input-links.json', JSON.stringify(formattedLinks, null, 2));
  console.log('Successfully created input-links.json!');
}

processFile();