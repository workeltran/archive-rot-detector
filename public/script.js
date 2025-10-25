// Wait for the page to load
document.addEventListener('DOMContentLoaded', () => {
    
    const checkButton = document.getElementById('check-btn');
    const jsonInput = document.getElementById('json-input');
    const resultsBox = document.getElementById('results-box');

    // Add a click listener to the button
    checkButton.addEventListener('click', async () => {
        let linksArray;

        // 1. Parse the text from the textarea
        try {
            linksArray = JSON.parse(jsonInput.value);
            if (!Array.isArray(linksArray)) {
                throw new Error('Input is not a JSON array.');
            }
        } catch (err) {
            resultsBox.innerHTML = `<p style="color: red;"><strong>Error:</strong> Invalid JSON. Please paste a valid JSON array.</p>`;
            return;
        }

        // 2. Show a loading message
        resultsBox.innerHTML = `<p>Checking ${linksArray.length} links... This may take a moment.</p><div class="loader"></div>`; // Added a simple loader
        checkButton.disabled = true;

        // 3. Send the data to our server
        try {
            const response = await fetch('/check-links', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ links: linksArray }), 
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }

            const report = await response.json();
            
            // --- UPDATED COUNTING LOGIC ---
            let found = 0;
            let notFound = 0;
            let timeout = 0; // New counter
            let error = 0;   // New counter

            report.results.forEach(item => {
                if (item.status === 'FOUND') found++;
                else if (item.status === 'NOT_FOUND') notFound++;
                else if (item.status === 'TIMEOUT') timeout++; // Count timeouts separately
                else error++; // All others are errors
            });
            // --------------------------------

            // --- UPDATED DISPLAY LOGIC WITH &nbsp; ---
            resultsBox.innerHTML = `
                <h3>Check Complete!</h3>
                <div class="stats">
                    <p><span class="dot green"></span><strong>${found}</strong>&nbsp;FOUND</p>
                    <p><span class="dot red"></span><strong>${notFound}</strong>&nbsp;NOT_FOUND</p>
                    <p><span class="dot orange"></span><strong>${timeout}</strong>&nbsp;TIMEOUT</p> 
                    <p><span class="dot yellow"></span><strong>${error}</strong>&nbsp;ERROR</p>
                </div>
                <p><small>Full JSON report logged to browser console.</small></p>
            `;
            console.log(report); 

        } catch (err) {
            resultsBox.innerHTML = `<p style="color: red;"><strong>Error:</strong> ${err.message}</p>`;
        } finally {
            checkButton.disabled = false;
        }
    });
});