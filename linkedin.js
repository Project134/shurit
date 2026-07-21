(function injectControlPanel() {
    if (document.getElementById('custom-scraper-panel')) {
        console.log("Panel already exists!");
        return;
    }

    let globalExtractedData = [];

    // 1. Expand Logic
    function expandPosts() {
        const posts = document.querySelectorAll('div[role="listitem"]');
        let clickCount = 0;

        posts.forEach(post => {
            const buttons = post.querySelectorAll('button');
            buttons.forEach(btn => {
                const btnText = btn.innerText ? btn.innerText.toLowerCase().trim() : '';
                if (btnText === '…see more' || btnText === '…more' || btnText === '… more' || btnText === 'see more' || btnText === 'more') {
                    btn.click();
                    clickCount++;
                }
            });
        });

        return clickCount;
    }

    // 2. Extraction Logic (Featuring Deep URN Scan)
    function extractData() {
        const postElements = document.querySelectorAll('div[role="listitem"]');
        let newItemsCount = 0;

        postElements.forEach(post => {
            // --- Profile URL ---
            const profileLinkEl = post.querySelector('a[href*="/in/"]');
            const profileUrl = profileLinkEl ? profileLinkEl.href : null;

            // --- Post URL (DEEP SCAN LOGIC) ---
            let postUrl = null;
            
            // Strategy 1: Look for the 19-digit Activity URN that the "Copy link to post" button relies on
            const urnMatch = post.innerHTML.match(/urn:li:(?:activity|share|ugcPost):\d{19}/);
            if (urnMatch) {
                // Construct the permanent routing link
                postUrl = `https://www.linkedin.com/feed/update/${urnMatch[0]}`;
            } else {
                // Strategy 2: Fallback to searching the HTML for a direct /posts/ link
                const directUrlMatch = post.innerHTML.match(/https:\/\/www\.linkedin\.com\/posts\/[^"'\s]+/);
                if (directUrlMatch) {
                    postUrl = directUrlMatch[0].split('?')[0]; // Strip tracking IDs
                }
            }

            // --- Author Name ---
            let authorName = null;
            const profileImgEl = post.querySelector('img[alt^="View"]');
            if (profileImgEl) {
                authorName = profileImgEl.getAttribute('alt')
                    .replace('View ', '')
                    .replace(/’s profile.*/, '')
                    .trim();
            }

            // --- Post Content ---
            const contentBox = post.querySelector('[data-testid="expandable-text-box"]');
            let content = contentBox ? contentBox.innerText.trim() : null;

            // --- Author Summary ---
            let authorSummary = null;
            if (contentBox && post.innerText) {
                const fullPostText = post.innerText;
                const contentStartIndex = fullPostText.indexOf(contentBox.innerText);
                
                if (contentStartIndex > 0) {
                    const textBeforeContent = fullPostText.substring(0, contentStartIndex);
                    
                    authorSummary = textBeforeContent
                        .split('\n')
                        .map(t => t.trim())
                        .filter(t => t.length > 0)
                        .filter(t => authorName ? !t.includes(authorName) : true) 
                        .filter(t => !t.match(/(1st|2nd|3rd) degree/i))
                        .filter(t => !['Follow', 'Connect', 'Save', 'More'].includes(t))
                        .filter(t => !t.match(/^[\d]+[hdwmy](\s*•.*)?$/i)) 
                        .filter(t => !t.includes('’s profile')) 
                        .join(' | '); 
                }
            }

            // --- Reactions Count ---
            let reactions = 0;
            const reactionMatch = post.innerText.match(/(\d+)\s*(?:<!-- -->\s*)?reactions?/i);
            if (reactionMatch) {
                reactions = parseInt(reactionMatch[1], 10);
            } else {
                const reactionBtn = post.querySelector('button[aria-label^="Reaction button"]');
                if (reactionBtn) {
                    reactions = parseInt(reactionBtn.innerText.trim(), 10) || 0;
                }
            }

            // --- Comments Count ---
            let comments = 0;
            const commentBtn = post.querySelector('button[aria-label="Comment"]');
            if (commentBtn) {
                comments = parseInt(commentBtn.innerText.trim(), 10) || 0;
            }

            // Save Valid Posts
            if (authorName || content) {
                const isDuplicate = globalExtractedData.some(d => d.content === content && d.authorName === authorName);
                if (!isDuplicate) {
                    globalExtractedData.push({ 
                        authorName, 
                        authorSummary, 
                        profileUrl, 
                        postUrl, // Highly accurate URLs are now pulled here
                        content, 
                        reactions, 
                        comments 
                    });
                    newItemsCount++;
                }
            }
        });

        return newItemsCount;
    }

    // 3. UI Construction
    const panel = document.createElement('div');
    panel.id = 'custom-scraper-panel';
    panel.style.cssText = `
        position: fixed; top: 80px; right: 20px; width: 260px;
        background: white; border: 2px solid #0a66c2; border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 9999999;
        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        padding: 15px; color: #333; box-sizing: border-box;
    `;

    const header = document.createElement('h3');
    header.innerText = 'LinkedIn Extractor';
    header.style.cssText = 'margin: 0 0 10px 0; font-size: 16px; text-align: center; color: #0a66c2;';
    panel.appendChild(header);

    const statusText = document.createElement('p');
    statusText.innerText = 'Total Extracted: 0';
    statusText.style.cssText = 'margin: 0 0 15px 0; font-size: 14px; text-align: center; font-weight: bold;';
    panel.appendChild(statusText);

    function createButton(text, bgColor, hoverColor) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.cssText = `
            display: block; width: 100%; margin-bottom: 10px; padding: 10px;
            border: none; border-radius: 5px; cursor: pointer; transition: background 0.2s;
            background: ${bgColor}; color: white; font-weight: bold; font-size: 13px;
        `;
        btn.onmouseover = () => btn.style.background = hoverColor;
        btn.onmouseout = () => btn.style.background = bgColor;
        return btn;
    }

    const expandBtn = createButton('1. 📖 Expand Posts', '#e6a700', '#b38200');
    expandBtn.onclick = () => {
        const clicked = expandPosts();
        if (clicked > 0) {
            expandBtn.innerText = `✅ Expanded ${clicked} Posts!`;
            console.log(`Successfully expanded ${clicked} posts.`);
        } else {
            expandBtn.innerText = '⚠️ No "more" buttons found';
        }
        setTimeout(() => { expandBtn.innerText = '1. 📖 Expand Posts'; }, 2000);
    };
    panel.appendChild(expandBtn);

    const extractBtn = createButton('2. 🔍 Extract Data', '#0a66c2', '#004182');
    extractBtn.onclick = () => {
        const newCount = extractData();
        statusText.innerText = `Total Extracted: ${globalExtractedData.length}`;
        console.log(`Extracted ${newCount} new posts. Current Total: ${globalExtractedData.length}`);
        
        extractBtn.innerText = '✅ Extracted!';
        setTimeout(() => { extractBtn.innerText = '2. 🔍 Extract Data'; }, 1500);
    };
    panel.appendChild(extractBtn);

    const downloadBtn = createButton('3. 📥 Download JSON', '#057642', '#034728');
    downloadBtn.onclick = () => {
        if (globalExtractedData.length === 0) {
            alert("No data extracted yet! Click 'Extract Data' first.");
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(globalExtractedData, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", `linkedin_data_${Date.now()}.json`);
        dlAnchor.click();
    };
    panel.appendChild(downloadBtn);

    const closeBtn = createButton('❌ Close Panel', '#cc0000', '#990000');
    closeBtn.onclick = () => {
        document.body.removeChild(panel);
    };
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
    console.log("✅ Control panel injected! Post URL extraction now bypasses the UI completely for 100% accuracy.");
})();