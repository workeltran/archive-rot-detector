const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// This is the route you will build
app.get('/check-links', async (req, res) => {
  console.log('Received request to /check-links');

  // Load the small test file for this block
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
  
  // TODO: Loop over linksToTest and check each one
  // (This is what we'll build in the 9:30 AM block)

  console.log('Link checking complete.');
  res.json({
    message: 'Check complete (logic not yet implemented)',
    results: linksToTest // For now, just send back the input
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});