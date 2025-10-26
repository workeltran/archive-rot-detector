# Archive Link Rot Detector: For Broken Video and Stream Links

## Background
Digital archives are constantly threatened by link rot, the gradual removal of existing content on online platforms. Simple HTTP status code checks (like a basic ```404```) fail completely because sites like Twitch and YouTube deliberately return a misleading ```200 OK``` status even when a video is deleted, private, or expired. The Archive Link Rot Detector solves this by using a Stealth, Batched Node.js API to bypass bot detection and perform ```soft 404``` Detection, accurately classifying dead content as ```NOT_FOUND```. This provides archivists with a verified, machine-readable JSON report ready for migration into any MERN stack database.

## Key Technical Features
This project was built to overcome complex web scraping and system resource limitations. The core technical value lies in its method for identifying ```soft 404s```. The system uses a Stealth Mode setup with Puppeteer-Extra-Plugin-Stealth to bypass bot detection by Twitch and YouTube, ensuring stable navigation and preventing the API from being blocked. The most crucial component is the ```soft 404``` Detection logic, which analyzes the rendered page's title for error strings like "unavailable" or "twitch" (for expired VODs), accurately confirming the link's status. To ensure stability, the API is structured with a Launch/Close Browser Per Batch logic. This solves the critical memory crash problem by only launching the heavy headless browser for a small batch of links and immediately closing it afterward, making the API gentle on system resources.

## Getting Started (Run the Demo)
To run the functional frontend demonstration, you will first need to set up the dependencies and start the server.

- **Prerequisites:** you must have Node.js installed on your system. This also installs npm (Node Package Manager).
- **Clone the Repository:** clone the project and change into the directory using the following commands:
  - ```git clone https://github.com/your-username/your-repo-name.git```
  - ```cd your-repo-name```
- **Install Dependencies:** run ```npm install``` to download all necessary packages, including Express, Axios, and Puppeteer. (This may take a minute as it also downloads a local copy of Chromium for Puppeteer.)
  - ```npm install```
- **Run the Server:** Start the API server on the final, configured port by running ```node src/server.js```. The server will run on ```http://localhost:8000```. (I chose port 8000 bc my usual 8080 port is already taken by a different app. If you need to change the port number, find line 14 in ```server.js``` for the port declaration.)
  - ```node src/server.js```
- **Use the Frontend:** Open your browser to ```http://localhost:8000```. You can then copy the JSON array from the test-early-diverse-sample.json file in the project folder, paste the list into the text area, and click "Check Links" to see a live, accurate report.

# What's Next
The current tool is the most stable and accurate scraping solution possible for a live environment. However, in the future, scraping should be eliminated entirely. Upgrade the core logic by switching from Puppeteer to the fast, stable Twitch Helix API and YouTube Data API will solve this issue. Another possible feature is a retry queue with exponential backoff to automatically re-check links that return a ```TIMEOUT``` status, ensuring full data fidelity on the final report.
