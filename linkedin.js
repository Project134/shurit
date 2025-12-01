async function addDataToIndexedDB(dataList, dbName, storeName) {
  return new Promise((resolve, reject) => {
    // Open the database with a version number to trigger upgrade if needed
    const request = indexedDB.open(dbName, 1);
    
    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create the object store if it doesn't exist
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
        console.log(`Created object store: ${storeName}`);
      }
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      // Check if object store exists
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(new Error(`Object store "${storeName}" does not exist`));
        return;
      }
      
      // Start a transaction
      const transaction = db.transaction([storeName], 'readwrite');
      const objectStore = transaction.objectStore(storeName);
      
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      // Add/update each item in the list
      dataList.forEach((item, index) => {
        if (!item.id) {
          errors.push(`Item at index ${index} is missing an 'id' field`);
          errorCount++;
          return;
        }
        
        // Use put to insert or update (put replaces if id exists)
        const putRequest = objectStore.put(item);
        
        putRequest.onsuccess = () => {
          successCount++;
        };
        
        putRequest.onerror = () => {
          errorCount++;
          errors.push(`Failed to add item with id ${item.id}: ${putRequest.error}`);
        };
      });
      
      // Handle transaction completion
      transaction.oncomplete = () => {
        db.close();
        resolve({
          success: true,
          successCount,
          errorCount,
          errors: errors.length > 0 ? errors : null
        });
      };
      
      transaction.onerror = () => {
        db.close();
        reject(new Error(`Transaction failed: ${transaction.error}`));
      };
    };
  });
}

// Function to delete all data from IndexedDB
async function deleteAllDataFromIndexedDB(dbName, storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    
    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      // Check if object store exists
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(new Error(`Object store "${storeName}" does not exist`));
        return;
      }
      
      // Start a transaction
      const transaction = db.transaction([storeName], 'readwrite');
      const objectStore = transaction.objectStore(storeName);
      
      // Clear all records
      const clearRequest = objectStore.clear();
      
      clearRequest.onsuccess = () => {
        db.close();
        resolve({ success: true, message: 'All data deleted successfully' });
      };
      
      clearRequest.onerror = () => {
        db.close();
        reject(new Error(`Failed to clear data: ${clearRequest.error}`));
      };
    };
  });
}

function attachControlDiv() {
  // Create the main container div
  const controlDiv = document.createElement('div');
  controlDiv.id = 'control-panel';
  controlDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #f0f0f0;
    padding: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 9999;
    border-radius: 8px;
    cursor: move;
    user-select: none;
  `;

  // Create drag handle
  const dragHandle = document.createElement('div');
  dragHandle.style.cssText = `
    background-color: #ddd;
    padding: 8px;
    margin: -10px -10px 10px -10px;
    border-radius: 8px 8px 0 0;
    text-align: center;
    font-weight: bold;
    font-size: 12px;
    color: #666;
    cursor: move;
  `;
  dragHandle.textContent = '⋮⋮ Control Panel ⋮⋮';

  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
  `;

  // Create Scroll button
  const scrollBtn = document.createElement('button');
  scrollBtn.textContent = 'Scroll';
  scrollBtn.id = 'scroll-btn';
  scrollBtn.style.cssText = `
    padding: 8px 16px;
    background-color: #9C27B0;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  scrollBtn.addEventListener('click', scrollFunction);

  // Create Execute button
  const executeBtn = document.createElement('button');
  executeBtn.textContent = 'Execute';
  executeBtn.style.cssText = `
    padding: 8px 16px;
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  executeBtn.addEventListener('click', executeFunction);

  // Create Download button
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download';
  downloadBtn.style.cssText = `
    padding: 8px 16px;
    background-color: #2196F3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  downloadBtn.addEventListener('click', downloadFunction);

  // Create Delete DB button
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete DB';
  deleteBtn.style.cssText = `
    padding: 8px 16px;
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  deleteBtn.addEventListener('click', deleteDBFunction);

  // Create Clear Logs button
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear Logs';
  clearBtn.style.cssText = `
    padding: 8px 16px;
    background-color: #ff9800;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  clearBtn.addEventListener('click', clearLogs);

  // Append buttons to button container
  buttonContainer.appendChild(scrollBtn);
  buttonContainer.appendChild(executeBtn);
  buttonContainer.appendChild(downloadBtn);
  buttonContainer.appendChild(deleteBtn);
  buttonContainer.appendChild(clearBtn);

  // Create status/log div
  const logDiv = document.createElement('div');
  logDiv.id = 'log-panel';
  logDiv.style.cssText = `
    background-color: #ffffff;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 10px;
    max-height: 100px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 12px;
    color: #333;
    cursor: default;
  `;

  // Append elements to control div
  controlDiv.appendChild(dragHandle);
  controlDiv.appendChild(buttonContainer);
  controlDiv.appendChild(logDiv);

  // Attach to the document body
  document.body.appendChild(controlDiv);

  // Make the panel draggable
  makeDraggable(controlDiv, dragHandle);

  // Add initial log message
  addLog('Control panel initialized', 'info');
}

// Make element draggable
function makeDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Set the element's new position
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    element.style.right = "auto";
  }

  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// Logging utility function
function addLog(message, type = 'info') {
  const logPanel = document.getElementById('log-panel');
  if (!logPanel) return;

  const logEntry = document.createElement('div');
  logEntry.style.cssText = `
    padding: 4px 0;
    border-bottom: 1px solid #eee;
  `;

  const timestamp = new Date().toLocaleTimeString();
  
  // Color based on log type
  let color = '#333';
  if (type === 'success') color = '#4CAF50';
  if (type === 'error') color = '#f44336';
  if (type === 'warning') color = '#ff9800';
  
  logEntry.innerHTML = `<span style="color: #999;">[${timestamp}]</span> <span style="color: ${color};">${message}</span>`;
  
  logPanel.appendChild(logEntry);
  
  // Auto-scroll to bottom
  logPanel.scrollTop = logPanel.scrollHeight;
}

// Clear logs function
function clearLogs() {
  const logPanel = document.getElementById('log-panel');
  if (logPanel) {
    logPanel.innerHTML = '';
    addLog('Logs cleared', 'info');
  }
}

// Variable to control scroll loop
let isScrolling = false;

// Scroll function - scrolls until page stops loading new content
async function scrollFunction() {
  const scrollBtn = document.getElementById('scroll-btn');
  
  // If already scrolling, stop it
  if (isScrolling) {
    isScrolling = false;
    scrollBtn.textContent = 'Scroll';
    scrollBtn.style.backgroundColor = '#9C27B0';
    addLog('Scrolling stopped by user', 'warning');
    return;
  }
  
  // Start scrolling
  isScrolling = true;
  scrollBtn.textContent = 'Stop';
  scrollBtn.style.backgroundColor = '#f44336';
  addLog('Starting auto-scroll...', 'info');
  
  let previousHeight = 0;
  let noChangeCount = 0;
  const maxNoChangeAttempts = 3; // Stop after 3 attempts with no height change
  const scrollDelay = 2000; // Wait 2 seconds between scrolls
  
  try {
    while (isScrolling) {
      // Get current page height
      const currentHeight = document.body.scrollHeight;
      
      // Scroll to bottom
      window.scrollTo(0, document.body.scrollHeight);
      addLog(`Scrolled to ${currentHeight}px`, 'info');
      
      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
      
      // Check if new content loaded
      const newHeight = document.body.scrollHeight;
      
      if (newHeight === previousHeight) {
        noChangeCount++;
        addLog(`No new content (${noChangeCount}/${maxNoChangeAttempts})`, 'warning');
        
        if (noChangeCount >= maxNoChangeAttempts) {
          addLog('Reached end of page - no more content loading', 'success');
          break;
        }
      } else {
        noChangeCount = 0; // Reset counter if new content loaded
        addLog(`New content loaded (+${newHeight - previousHeight}px)`, 'success');
      }
      
      previousHeight = newHeight;
    }
  } catch (error) {
    console.error('Error during scrolling:', error);
    addLog(`Scroll error: ${error.message}`, 'error');
  } finally {
    // Reset button state
    isScrolling = false;
    scrollBtn.textContent = 'Scroll';
    scrollBtn.style.backgroundColor = '#9C27B0';
    addLog('Auto-scroll completed', 'success');
  }
}

async function extractLinkedInPosts() {
  // Step 0: Click all "Show translation" buttons first
  console.log('Checking for translation buttons...');
  const translationButtons = document.querySelectorAll('.feed-shared-see-translation-button');
  
  for (const btn of translationButtons) {
    try {
      // Check if button is visible and clickable
      if (btn.offsetParent !== null) {
        btn.click();
        addLog('Clicked translation button', 'info');
        // Small delay to allow translation to load
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (e) {
      console.log('Could not click a translation button:', e);
    }
  }
  
  console.log(`Processed ${translationButtons.length} translation buttons`);
  
  // Step 1: Click all "see more" buttons to expand truncated content
  console.log('Expanding truncated posts...');
  const moreButtons = document.querySelectorAll('.feed-shared-inline-show-more-text__see-more-less-toggle');
  
  for (const btn of moreButtons) {
    try {
      btn.click();
      // Small delay to allow content to load
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (e) {
      console.log('Could not click a more button:', e);
    }
  }
  
  console.log(`Expanded ${moreButtons.length} posts`);
  
  // Step 2: Extract data from each post
  // Try multiple selectors to find posts
  let posts = document.querySelectorAll('[role="article"]');
  
  if (posts.length === 0) {
    console.log('No posts found with [role="article"], trying alternative selectors...');
    addLog('No posts found with primary selector, trying alternatives...', 'warning');
    
    // Try alternative selectors
    posts = document.querySelectorAll('.feed-shared-update-v2');
    
    if (posts.length === 0) {
      posts = document.querySelectorAll('[data-urn*="activity"]');
    }
  }
  
  console.log(`Found ${posts.length} posts to extract`);
  addLog(`Found ${posts.length} posts to extract`, 'info');
  
  if (posts.length === 0) {
    addLog('No posts found on page. Try scrolling first.', 'error');
    return [];
  }
  
  const data = [];
  
  posts.forEach((post, index) => {
    try {
      // Extract post ID (from data-urn attribute)
      const urnId = post.getAttribute('data-urn') || `post-${index}`;
      // Extract just the numeric ID from URN format (urn:li:activity:6904835503909408768)
      const id = urnId.includes(':') ? urnId.split(':').pop() : urnId;
      
      console.log(`Processing post ${index + 1}, URN: ${urnId}`);
      
      // Extract poster description
      const descElement = post.querySelector('.update-components-actor__description span[aria-hidden="true"]');
      const posterDescription = descElement ? descElement.textContent.trim() : '';
      
      // Extract poster name
      const nameElement = post.querySelector('.update-components-actor__title .hoverable-link-text span[dir="ltr"] span[aria-hidden="true"]');
      const postedBy = nameElement ? nameElement.textContent.trim() : '';
      
      console.log(`  Posted by: ${postedBy}`);
      
      // Extract connection type (1st, 2nd, 3rd+, etc.)
      const connectionElement = post.querySelector('.update-components-actor__supplementary-actor-info span[aria-hidden="true"]');
      let connection = '';
      if (connectionElement) {
        const text = connectionElement.textContent.trim();
        const match = text.match(/(\d+(?:st|nd|rd|th)\+?)/);
        connection = match ? match[1] : '';
      }
      
      // Extract poster LinkedIn URL
      const urlElement = post.querySelector('.update-components-actor__meta-link');
      const urlPostedBy = urlElement ? urlElement.getAttribute('href') : '';
      
      // Extract post age
      const ageElement = post.querySelector('.update-components-actor__sub-description span[aria-hidden="true"]');
      let postAge = '';
      if (ageElement) {
        const text = ageElement.textContent.trim();
        // Extract time part (e.g., "4w", "2w", "5yr")
        const match = text.match(/(\d+[a-z]+)/);
        postAge = match ? match[1] : text.split('•')[0].trim();
      }
      
      // Extract post content
      const contentElement = post.querySelector('.update-components-text span[dir="ltr"]');
      let postContent = '';
      if (contentElement) {
        // Get text content and clean up extra whitespace
        postContent = contentElement.textContent
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      console.log(`  Content length: ${postContent.length} characters`);
      
      // Extract post URL from the post's URN
      let postUrl = '';
      if (urnId && urnId.includes(':')) {
        // Extract numeric ID from URN (e.g., urn:li:activity:7401363182046425088)
        const numericId = urnId.split(':').pop();
        postUrl = `https://www.linkedin.com/feed/update/${urnId.replace('urn:li:', 'urn:li:')}`;
      }
      
      // Alternative: Look for permalink or share link in the post
      const shareLink = post.querySelector('a[href*="/feed/update/"]');
      if (shareLink && !postUrl) {
        postUrl = shareLink.getAttribute('href');
        if (postUrl && !postUrl.startsWith('http')) {
          postUrl = 'https://www.linkedin.com' + postUrl;
        }
      }
      
      // Extract hashtags/tags (pipe separated)
      const tagElements = post.querySelectorAll('.update-components-text a[href*="keywords"]');
      const postTags = Array.from(tagElements)
        .map(tag => tag.textContent.trim().replace('#', ''))
        .join('|');
      
      // Extract email addresses (pipe separated)
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = postContent.match(emailRegex) || [];
      const emailIds = [...new Set(emails)].join('|'); // Remove duplicates
      
      // Extract phone numbers (pipe separated)
      // Matches various formats: +1-234-567-8900, (123) 456-7890, 123-456-7890, +91 98765 43210, etc.
      const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d{1,3}[-.\s]?\d{4,5}[-.\s]?\d{4,5}/g;
      const phones = postContent.match(phoneRegex) || [];
      // Filter out numbers that might be dates or other non-phone numbers
      const validPhones = phones.filter(phone => {
        const digitsOnly = phone.replace(/\D/g, '');
        return digitsOnly.length >= 10 && digitsOnly.length <= 15;
      });
      const phoneNo = [...new Set(validPhones)].join('|'); // Remove duplicates
      
      // Create post object
      const postData = {
        id,
        postedBy,
        posterDescription,
        connection,
        urlPostedBy,
        postAge,
        postUrl,
        postContent,
        postTags,
        emailIds,
        phoneNo
      };
      
      // Only add if we have at least some basic data
      if (postedBy || postContent) {
        data.push(postData);
        console.log(`  ✓ Post ${index + 1} extracted successfully`);
      } else {
        console.log(`  ✗ Post ${index + 1} skipped - no meaningful data found`);
      }
      
    } catch (e) {
      console.error(`Error extracting post ${index}:`, e);
      addLog(`Error on post ${index + 1}: ${e.message}`, 'error');
    }
  });
  
  console.log(`Successfully extracted ${data.length} posts`);
  addLog(`Successfully extracted ${data.length} posts with data`, 'success');
  return data;
}
// Execute function
async function executeFunction() {
  console.log('We are in execute function');
  addLog('Execute function called', 'success');

  try {
    // Extract data from LinkedIn posts
    addLog('Starting post extraction...', 'info');
    const data = await extractLinkedInPosts();
    
    if (!data || data.length === 0) {
      addLog('No posts found to extract', 'warning');
      return;
    }
    
    addLog(`Successfully extracted ${data.length} posts`, 'success');
    
    // Store the extracted data in IndexedDB
    addLog('Storing data in IndexedDB...', 'info');
    await addDataToIndexedDB(data, 'lnPostDb', 'postStore');
    
    addLog('Data stored successfully in IndexedDB', 'success');
    console.log('Operation completed. Data:', data);
    
  } catch (error) {
    console.error('Error in executeFunction:', error);
    addLog(`Error: ${error.message}`, 'error');
  }
}

// Delete DB function
async function deleteDBFunction() {
  console.log('Delete DB function called');
  addLog('Delete DB function called', 'warning');
  
  const dbName = 'lnPostDb';
  const storeName = 'postStore';
  
  // Confirm before deleting
  const confirmed = confirm('Are you sure you want to delete all posts from the database? This action cannot be undone.');
  
  if (!confirmed) {
    addLog('Delete operation cancelled by user', 'info');
    return;
  }
  
  try {
    addLog('Deleting all data from IndexedDB...', 'info');
    
    // Delete all data from IndexedDB
    await deleteAllDataFromIndexedDB(dbName, storeName);
    
    addLog('All posts deleted successfully from database', 'success');
    console.log('Database cleared successfully');
    
  } catch (error) {
    console.error('Error in deleteDBFunction:', error);
    addLog(`Error: ${error.message}`, 'error');
  }
}

// Download function - exports IndexedDB data to CSV
async function downloadFunction() {
  console.log('We are in download function');
  addLog('Download function called', 'info');
  
  const dbName = 'lnPostDb';
  const storeName = 'postStore';
  
  try {
    addLog('Retrieving data from IndexedDB...', 'info');
    
    // Get all data from IndexedDB
    const data = await getAllDataFromIndexedDB(dbName, storeName);
    
    if (!data || data.length === 0) {
      addLog('No data found in database', 'warning');
      return;
    }
    
    addLog(`Retrieved ${data.length} records`, 'success');
    
    // Convert to CSV
    addLog('Converting to CSV...', 'info');
    const csv = convertToCSV(data);
    
    // Create and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `linkedin_posts_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addLog('CSV download completed successfully', 'success');
    
  } catch (error) {
    console.error('Error in downloadFunction:', error);
    addLog(`Error: ${error.message}`, 'error');
  }
}

// Helper function to get all data from IndexedDB
async function getAllDataFromIndexedDB(dbName, storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    
    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      // Check if object store exists
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(new Error(`Object store "${storeName}" does not exist`));
        return;
      }
      
      // Start a transaction
      const transaction = db.transaction([storeName], 'readonly');
      const objectStore = transaction.objectStore(storeName);
      
      // Get all records
      const getAllRequest = objectStore.getAll();
      
      getAllRequest.onsuccess = () => {
        db.close();
        resolve(getAllRequest.result);
      };
      
      getAllRequest.onerror = () => {
        db.close();
        reject(new Error(`Failed to retrieve data: ${getAllRequest.error}`));
      };
    };
  });
}

// Helper function to convert data array to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }
  
  // Get headers from the first object
  const headers = Object.keys(data[0]);
  
  // Create CSV header row
  const csvHeader = headers.map(header => `"${header}"`).join(',');
  
  // Create CSV data rows
  const csvRows = data.map(row => {
    return headers.map(header => {
      let cell = row[header] || '';
      
      // Convert to string and escape quotes
      cell = String(cell).replace(/"/g, '""');
      
      // Wrap in quotes to handle commas and newlines
      return `"${cell}"`;
    }).join(',');
  });
  
  // Combine header and rows
  return [csvHeader, ...csvRows].join('\n');
}

// Call the function to attach the div
attachControlDiv();