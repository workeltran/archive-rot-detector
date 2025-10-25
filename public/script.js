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
        resultsBox.innerHTML = `<p>Checking ${linksArray.length} links... This may take a moment.</p><div class="loader"></div>`;
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
            const fullJsonOutput = JSON.stringify(report.results, null, 2);

            // 4. Count the results
            let found = 0;
            let notFound = 0;
            let timeout = 0;
            let error = 0;

            report.results.forEach(item => {
                if (item.status === 'FOUND') found++;
                else if (item.status === 'NOT_FOUND') notFound++;
                else if (item.status === 'TIMEOUT') timeout++;
                else error++;
            });

            // 5. Display the Summary and Detail elements
            resultsBox.innerHTML = `
                <h3>Check Complete!</h3>
                <div class="stats-summary">
                    <p><span class="dot green"></span><strong>${found}</strong>&nbsp;FOUND</p>
                    <p><span class="dot red"></span><strong>${notFound}</strong>&nbsp;NOT_FOUND</p>
                    <p><span class="dot orange"></span><strong>${timeout}</strong>&nbsp;TIMEOUT</p> 
                    <p><span class="dot yellow"></span><strong>${error}</strong>&nbsp;ERROR</p>
                </div>
                
                <div class="detail-actions" style="margin-top: 20px;">
                    <button class="btn btn-secondary" id="toggle-details">Show Full Report (${linksArray.length} items)</button>
                    <button class="btn btn-secondary" id="download-report">Download JSON</button>
                </div>

                <pre id="full-report" style="display: none;">${fullJsonOutput}</pre>
            `;
            
            // 6. Add event listeners for the new buttons
            const toggleButton = document.getElementById('toggle-details');
            const fullReport = document.getElementById('full-report');
            const downloadButton = document.getElementById('download-report');
            
            toggleButton.addEventListener('click', () => {
                const isHidden = fullReport.style.display === 'none';
                fullReport.style.display = isHidden ? 'block' : 'none';
                toggleButton.textContent = isHidden ? 'Hide Full Report' : 'Show Full Report';
            });
            
            downloadButton.addEventListener('click', () => {
                const blob = new Blob([fullJsonOutput], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'link_rot_report.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

        } catch (err) {
            resultsBox.innerHTML = `<p style="color: red;"><strong>Error:</strong> ${err.message}</p>`;
        } finally {
            checkButton.disabled = false;
        }
    });
});