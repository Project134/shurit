(function() {
    // Function to create and display the popup div
    function createPopup() {
        const popupDiv = document.createElement('div');
        popupDiv.style.position = 'fixed';
        popupDiv.style.right = '10px';
        popupDiv.style.top = '10px';
        popupDiv.style.padding = '10px';
        // popupDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';

        popupDiv.style.backgroundColor = 'black'; // Set background to black
        popupDiv.style.color = 'white';
        popupDiv.style.fontWeight = 'bold';
        popupDiv.style.border = '1px solid #ccc';
        popupDiv.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)';
        popupDiv.style.zIndex = '10000'; // High z-index to overlay on other elements
        popupDiv.id = 'divCountPopup'; // Add an ID for easy reference
        document.body.appendChild(popupDiv);

        // Function to update the count of div elements
        function updateCount() {
            let job = document.getElementsByClassName('t-24 job-details-jobs-unified-top-card__job-title')[0].innerText
            let company = document.getElementsByClassName('job-details-jobs-unified-top-card__company-name')[0].innerText
            let jd = document.getElementsByClassName('jobs-description__container')[0].innerText
            let empCount = document.getElementsByClassName('jobs-company__inline-information')[0].innerText
            const sentences = jd.split(/[.?!\n]/);
            const keywords = /yr|year|years|yrs/i; // 'i' flag for case insensitivity
            // Initialize an array to hold the matching sentences
            const matchingSentences = [];
        
            // Traverse through the sentences
            sentences.forEach(sentence => {
                // Check if the sentence contains any of the keywords
                if (keywords.test(sentence)) {
                    // Trim and add the matching sentence to the array
                    matchingSentences.push(sentence.trim());
                }
            });

            popupDiv.innerText = `${job} : ${company} (${empCount}) \n ${matchingSentences.join('\n')}`; // Update the text
        }

        // Update the initial count
        updateCount();

        // Debounce function to limit how often the count updates
        let timer;
        const debounceUpdate = () => {
            clearTimeout(timer);
            timer = setTimeout(updateCount, 100); // Update count after a pause
        };

        // MutationObserver to track changes in the DOM
        const observer = new MutationObserver(debounceUpdate);
        observer.observe(document.body, { childList: true, subtree: true }); // Watch for child additions/removals
    }

    // Check if the popup already exists
    if (!document.getElementById('divCountPopup')) {
        createPopup(); // Create the popup if it doesn't exist
    }
})();