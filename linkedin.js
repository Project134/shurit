(function injectControlPanel() {
    if (document.getElementById('custom-scraper-panel')) {
        console.log("Panel already exists!");
        return;
    }

    let globalExtractedData = [];

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

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

    // 1b. Translation Logic
    function translatePosts() {
        const posts = document.querySelectorAll('div[role="listitem"]');
        let clickCount = 0;

        posts.forEach(post => {
            // data-view-name="feed-see-translation" is present on some posts but not
            // all (LinkedIn's markup is inconsistent here), so fall back to matching
            // the button's visible text, same approach as expandPosts().
            let translateBtn = post.querySelector('button[data-view-name="feed-see-translation"]');

            if (!translateBtn) {
                const buttons = post.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = btn.innerText ? btn.innerText.toLowerCase().trim() : '';
                    if (text === 'show translation' || text === 'see translation') {
                        translateBtn = btn;
                        break;
                    }
                }
            }

            if (translateBtn) {
                translateBtn.click();
                clickCount++;
            }
        });

        return clickCount;
    }

    // 1c. Bounded Scroll & Load Logic (fixed at 5 passes, never runs unattended beyond that)
    function findLoadMoreButton() {
        const labels = ['show more results', 'see more results', 'load more', 'show more posts', 'show more'];
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.innerText ? btn.innerText.toLowerCase().trim() : '';
            if (labels.includes(text)) return btn;
        }
        return null;
    }

    async function scrollAndLoad(onProgress) {
        const MAX_PASSES = 20;
        let clicks = 0;

        for (let i = 1; i <= MAX_PASSES; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            if (onProgress) onProgress(i, MAX_PASSES, clicks);
            await sleep(1200);

            const loadMoreBtn = findLoadMoreButton();
            if (loadMoreBtn) {
                loadMoreBtn.click();
                clicks++;
                await sleep(1500); // let new posts render before next pass
            } else {
                await sleep(600);
            }
        }

        return clicks;
    }

    // --- Plain-format contact extraction (standard, non-obfuscated only) ---
    function extractEmails(text) {
        if (!text) return [];
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?/g;
        const matches = text.match(emailRegex) || [];
        return [...new Set(matches)];
    }

    function extractPhones(text) {
        if (!text) return [];
        // Standard written formats only, e.g. +91 98765 43210, (022) 1234-5678, 123-456-7890
        const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{0,4}/g;
        const candidates = text.match(phoneRegex) || [];
        const valid = candidates
            .map(c => c.trim())
            .filter(c => {
                const digits = c.replace(/\D/g, '');
                // require enough digits to plausibly be a phone number, cap to avoid false positives
                return digits.length >= 7 && digits.length <= 15;
            });
        return [...new Set(valid)];
    }

    // 2. Extraction Logic
    function extractData() {
        const postElements = document.querySelectorAll('div[role="listitem"]');
        let newItemsCount = 0;

        postElements.forEach(post => {
            // --- Profile URL ---
            const profileLinkEl = post.querySelector('a[href*="/in/"]');
            const profileUrl = profileLinkEl ? profileLinkEl.href : null;

            // --- Post URL ---
            // NOTE: LinkedIn's current search-results UI (SDUI) does not embed the
            // activity URN or a /posts/ link anywhere in the static DOM for this
            // screen. Both strategies below only work on the older feed markup;
            // on this screen they will legitimately return null rather than a bug.
            let postUrl = null;

            const urnMatch = post.innerHTML.match(/urn:li:(?:activity|share|ugcPost):\d{19}/);
            if (urnMatch) {
                postUrl = `https://www.linkedin.com/feed/update/${urnMatch[0]}`;
            } else {
                const directUrlMatch = post.innerHTML.match(/https:\/\/www\.linkedin\.com\/posts\/[^"'\s]+/);
                if (directUrlMatch) {
                    postUrl = directUrlMatch[0].split('?')[0];
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

            // --- Contact info found in plainly-written post text ---
            const emails = extractEmails(content);
            const phones = extractPhones(content);
            const email_fetched = emails.join('\n');
            const phone_fetched = phones.join('\n');

            // Save Valid Posts
            if (authorName || content) {
                const isDuplicate = globalExtractedData.some(d => d.content === content && d.authorName === authorName);
                if (!isDuplicate) {
                    globalExtractedData.push({
                        authorName,
                        authorSummary,
                        profileUrl,
                        postUrl,
                        content,
                        reactions,
                        comments,
                        email_fetched,
                        phone_fetched
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

    const scrollBtn = createButton('1. 🔁 Scroll & Load (20x)', '#c2410a', '#93300a');
    scrollBtn.onclick = async () => {
        scrollBtn.disabled = true;
        await scrollAndLoad((pass, total, clicks) => {
            scrollBtn.innerText = `Scrolling... (${pass}/${total}, loaded ${clicks}x)`;
        });
        scrollBtn.innerText = '✅ Done scrolling';
        scrollBtn.disabled = false;
        setTimeout(() => { scrollBtn.innerText = '1. 🔁 Scroll & Load (20x)'; }, 2500);
    };
    panel.appendChild(scrollBtn);

    const expandBtn = createButton('2. 📖 Expand Posts', '#e6a700', '#b38200');
    expandBtn.onclick = () => {
        const clicked = expandPosts();
        if (clicked > 0) {
            expandBtn.innerText = `✅ Expanded ${clicked} Posts!`;
            console.log(`Successfully expanded ${clicked} posts.`);
        } else {
            expandBtn.innerText = '⚠️ No "more" buttons found';
        }
        setTimeout(() => { expandBtn.innerText = '2. 📖 Expand Posts'; }, 2000);
    };
    panel.appendChild(expandBtn);

    const translateBtn = createButton('3. 🌐 Show Translations', '#6a3fb5', '#4d2d85');
    translateBtn.onclick = () => {
        const clicked = translatePosts();
        if (clicked > 0) {
            translateBtn.innerText = `✅ Translated ${clicked} Posts!`;
            console.log(`Clicked "Show translation" on ${clicked} posts.`);
        } else {
            translateBtn.innerText = '⚠️ No translation options found';
        }
        setTimeout(() => { translateBtn.innerText = '3. 🌐 Show Translations'; }, 2000);
    };
    panel.appendChild(translateBtn);

    const extractBtn = createButton('4. 🔍 Extract Data', '#0a66c2', '#004182');
    extractBtn.onclick = () => {
        const newCount = extractData();
        statusText.innerText = `Total Extracted: ${globalExtractedData.length}`;
        console.log(`Extracted ${newCount} new posts. Current Total: ${globalExtractedData.length}`);

        extractBtn.innerText = '✅ Extracted!';
        setTimeout(() => { extractBtn.innerText = '4. 🔍 Extract Data'; }, 1500);
    };
    panel.appendChild(extractBtn);

    const downloadBtn = createButton('5. 📥 Download JSON', '#057642', '#034728');
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
    console.log("✅ Control panel injected!");
})();