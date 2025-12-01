async function addDataToIndexedDB(dataList, dbName, storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    
    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
        console.log(`Created object store: ${storeName}`);
      }
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(new Error(`Object store "${storeName}" does not exist`));
        return;
      }
      
      const transaction = db.transaction([storeName], 'readwrite');
      const objectStore = transaction.objectStore(storeName);
      
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      dataList.forEach((item, index) => {
        if (!item.id) {
          errors.push(`Item at index ${index} is missing an 'id' field`);
          errorCount++;
          return;
        }
        
        const putRequest = objectStore.put(item);
        
        putRequest.onsuccess = () => {
          successCount++;
        };
        
        putRequest.onerror = () => {
          errorCount++;
          errors.push(`Failed to add item with id ${item.id}: ${putRequest.error}`);
        };
      });
      
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

async function deleteAllDataFromIndexedDB(dbName, storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    
    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(new Error(`Object store "${storeName}" does not exist`));
        return;
      }
      
      const transaction = db.transaction([storeName], 'readwrite');
      const objectStore = transaction.objectStore(storeName);
      
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
    min-width: 280px;
  `;

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

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
  `;

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

  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'CSV';
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

  // Create Download JSON button
  const downloadJsonBtn = document.createElement('button');
  downloadJsonBtn.textContent = 'JSON';
  downloadJsonBtn.style.cssText = `
    padding: 8px 16px;
    background-color: #00BCD4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  downloadJsonBtn.addEventListener('click', downloadJsonFunction);

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

  buttonContainer.appendChild(scrollBtn);
  buttonContainer.appendChild(executeBtn);
  buttonContainer.appendChild(downloadBtn);
  buttonContainer.appendChild(downloadJsonBtn);
  buttonContainer.appendChild(deleteBtn);
  buttonContainer.appendChild(clearBtn);

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

  controlDiv.appendChild(dragHandle);
  controlDiv.appendChild(buttonContainer);
  controlDiv.appendChild(logDiv);

  document.body.appendChild(controlDiv);

  makeDraggable(controlDiv, dragHandle);

  addLog('Control panel initialized', 'info');
}

function makeDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    element.style.right = "auto";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function addLog(message, type = 'info') {
  const logPanel = document.getElementById('log-panel');
  if (!logPanel) return;

  const logEntry = document.createElement('div');
  logEntry.style.cssText = `
    padding: 4px 0;
    border-bottom: 1px solid #eee;
  `;

  const timestamp = new Date().toLocaleTimeString();
  
  let color = '#333';
  if (type === 'success') color = '#4CAF50';
  if (type === 'error') color = '#f44336';
  if (type === 'warning') color = '#ff9800';
  
  logEntry.innerHTML = `<span style="color: #999;">[${timestamp}]</span> <span style="color: ${color};">${message}</span>`;
  
  logPanel.appendChild(logEntry);
  
  logPanel.scrollTop = logPanel.scrollHeight;
}

function clearLogs() {
  const logPanel = document.getElementById('log-panel');
  if (logPanel) {
    logPanel.innerHTML = '';
    addLog('Logs cleared', 'info');
  }
}

let isScrolling = false;

async function scrollFunction() {
  const scrollBtn = document.getElementById('scroll-btn');
  
  if (isScrolling) {
    isScrolling = false;
    scrollBtn.textContent = 'Scroll';
    scrollBtn.style.backgroundColor = '#9C27B0';
    addLog('Scrolling stopped by user', 'warning');
    return;
  }
  
  isScrolling = true;
  scrollBtn.textContent = 'Stop';
  scrollBtn.style.backgroundColor = '#f44336';
  addLog('Starting auto-scroll...', 'info');
  
  let previousHeight = 0;
  let noChangeCount = 0;
  const maxNoChangeAttempts = 3;
  const scrollDelay = 2000;
  
  try {
    while (isScrolling) {
      const currentHeight = document.body.scrollHeight;
      
      window.scrollTo(0, document.body.scrollHeight);
      addLog(`Scrolled to ${currentHeight}px`, 'info');
      
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
      
      const newHeight = document.body.scrollHeight;
      
      if (newHeight === previousHeight) {
        noChangeCount++;
        addLog(`No new content (${noChangeCount}/${maxNoChangeAttempts})`, 'warning');
        
        if (noChangeCount >= maxNoChangeAttempts) {
          addLog('Reached end of page - no more content loading', 'success');
          break;
        }
      } else {
        noChangeCount = 0;
        addLog(`New content loaded (+${newHeight - previousHeight}px)`, 'success');
      }
      
      previousHeight = newHeight;
    }
  } catch (error) {
    console.error('Error during scrolling:', error);
    addLog(`Scroll error: ${error.message}`, 'error');
  } finally {
    isScrolling = false;
    scrollBtn.textContent = 'Scroll';
    scrollBtn.style.backgroundColor = '#9C27B0';
    addLog('Auto-scroll completed', 'success');
  }
}

async function extractLinkedInPosts() {
  console.log('Checking for translation buttons...');
  const translationButtons = document.querySelectorAll('.feed-shared-see-translation-button');
  
  for (const btn of translationButtons) {
    try {
      if (btn.offsetParent !== null) {
        btn.click();
        addLog('Clicked translation button', 'info');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (e) {
      console.log('Could not click a translation button:', e);
    }
  }
  
  console.log(`Processed ${translationButtons.length} translation buttons`);
  
  console.log('Expanding truncated posts...');
  const moreButtons = document.querySelectorAll('.feed-shared-inline-show-more-text__see-more-less-toggle');
  
  for (const btn of moreButtons) {
    try {
      btn.click();
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (e) {
      console.log('Could not click a more button:', e);
    }
  }
  
  console.log(`Expanded ${moreButtons.length} posts`);
  
  let posts = document.querySelectorAll('[role="article"]');
  
  if (posts.length === 0) {
    console.log('No posts found with [role="article"], trying alternative selectors...');
    addLog('No posts found with primary selector, trying alternatives...', 'warning');
    
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
      const urnId = post.getAttribute('data-urn') || `post-${index}`;
      const id = urnId.includes(':') ? urnId.split(':').pop() : urnId;
      
      console.log(`Processing post ${index + 1}, URN: ${urnId}`);
      
      const descElement = post.querySelector('.update-components-actor__description span[aria-hidden="true"]');
      const posterDescription = descElement ? descElement.textContent.trim() : '';
      
      const nameElement = post.querySelector('.update-components-actor__title .hoverable-link-text span[dir="ltr"] span[aria-hidden="true"]');
      const postedBy = nameElement ? nameElement.textContent.trim() : '';
      
      console.log(`  Posted by: ${postedBy}`);
      
      const connectionElement = post.querySelector('.update-components-actor__supplementary-actor-info span[aria-hidden="true"]');
      let connection = '';
      if (connectionElement) {
        const text = connectionElement.textContent.trim();
        const match = text.match(/(\d+(?:st|nd|rd|th)\+?)/);
        connection = match ? match[1] : '';
      }
      
      const urlElement = post.querySelector('.update-components-actor__meta-link');
      const urlPostedBy = urlElement ? urlElement.getAttribute('href') : '';
      
      const ageElement = post.querySelector('.update-components-actor__sub-description span[aria-hidden="true"]');
      let postAge = '';
      if (ageElement) {
        const text = ageElement.textContent.trim();
        const match = text.match(/(\d+[a-z]+)/);
        postAge = match ? match[1] : text.split('•')[0].trim();
      }
      
      const contentElement = post.querySelector('.update-components-text span[dir="ltr"]');
      let postContent = '';
      if (contentElement) {
        postContent = contentElement.textContent
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      console.log(`  Content length: ${postContent.length} characters`);
      
      let postUrl = '';
      if (urnId && urnId.includes(':')) {
        const numericId = urnId.split(':').pop();
        postUrl = `https://www.linkedin.com/feed/update/${urnId.replace('urn:li:', 'urn:li:')}`;
      }
      
      const shareLink = post.querySelector('a[href*="/feed/update/"]');
      if (shareLink && !postUrl) {
        postUrl = shareLink.getAttribute('href');
        if (postUrl && !postUrl.startsWith('http')) {
          postUrl = 'https://www.linkedin.com' + postUrl;
        }
      }
      
      const tagElements = post.querySelectorAll('.update-components-text a[href*="keywords"]');
      const postTags = Array.from(tagElements)
        .map(tag => tag.textContent.trim().replace('#', ''))
        .join('|');
      
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = postContent.match(emailRegex) || [];
      const emailIds = [...new Set(emails)].join('|');
      
      const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d{1,3}[-.\s]?\d{4,5}[-.\s]?\d{4,5}/g;
      const phones = postContent.match(phoneRegex) || [];
      const validPhones = phones.filter(phone => {
        const digitsOnly = phone.replace(/\D/g, '');
        return digitsOnly.length >= 10 && digitsOnly.length <= 15;
      });
      const phoneNo = [...new Set(validPhones)].join('|');
      
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

async function executeFunction() {
  console.log('We are in execute function');
  addLog('Execute function called', 'success');

  try {
    addLog('Starting post extraction...', 'info');
    const data = await extractLinkedInPosts();
    
    if (!data || data.length === 0) {
      addLog('No posts found to extract', 'warning');
      return;
    }
    
    addLog(`Successfully extracted ${data.length} posts`, 'success');
    
    addLog('Storing data in IndexedDB...', 'info');
    await addDataToIndexedDB(data, 'lnPostDb', 'postStore');
    
    addLog('Data stored successfully in IndexedDB', 'success');
    console.log('Operation completed. Data:', data);
    
  } catch (error) {
    console.error('Error in executeFunction:', error);
    addLog(`Error: ${error.message}`, 'error');
  }
}

async function deleteDBFunction() {
  console.log('Delete DB function called');
  addLog('Delete DB function called', 'warning');
  
  const dbName = 'lnPostDb';
  const storeName = 'postStore';
  
  const confirmed = confirm('Are you sure you want to delete all posts from the database? This action cannot be undone.');
  
  if (!confirmed) {
    addLog('Delete operation cancelled by user', 'info');
    return;
  }
  
  try {
    addLog('Deleting all data from IndexedDB...', 'info');
    
    await deleteAllDataFromIndexedDB(dbName, storeName);
    
    addLog('All posts deleted successfully from database', 'success');
    console.log('Database cleared successfully');
    
  } catch (error) {
    console.error('Error in deleteDBFunction:', error);
    addLog(`Error: ${error.message}`, 'error');
  }
}

async function downloadFunction() {
  console.log('We are in download CSV function');
  addLog('Download CSV function called', 'info');
  
  const dbName = 'lnPostDb';
  const storeName = 'postStore';
  
  try {
    addLog('Retrieving data from IndexedDB...', 'info');
    
    const data = await getAllDataFromIndexedDB(dbName, storeName);
    
    if (!data || data.length === 0) {
      addLog('No data found in database', 'warning');
      return;
    }
    
    addLog(`Retrieved ${data.length} records`, 'success');
    
    addLog('Converting to CSV...', 'info');
    const csv = convertToCSV(data);
    
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

// New function to download as JSON
async function downloadJsonFunction() {
  console.log('We are in download JSON function');
  addLog('Download JSON function called', 'info');
  
  const dbName = 'lnPostDb';
  const storeName = 'postStore';
  
  try {
    addLog('Retrieving data from IndexedDB...', 'info');
    
    const data = await getAllDataFromIndexedDB(dbName, storeName);
    
    if (!data || data.length === 0) {
      addLog('No data found in database', 'warning');
      return;
    }
    
    addLog(`Retrieved ${data.length} records`, 'success');
    
    addLog('Converting to JSON...', 'info');
    const jsonString = JSON.stringify(data, null, 2);
    
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `linkedin_posts_${new Date().toISOString().slice(0,10)}.json`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addLog('JSON download completed successfully', 'success');
    
  } catch (error) {
    console.error('Error in downloadJsonFunction:', error);
    addLog(`Error: ${error.message}`, 'error');
  }
}

async function getAllDataFromIndexedDB(dbName, storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    
    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(new Error(`Object store "${storeName}" does not exist`));
        return;
      }
      
      const transaction = db.transaction([storeName], 'readonly');
      const objectStore = transaction.objectStore(storeName);
      
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

function convertToCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }
  
  const headers = Object.keys(data[0]);
  
  const csvHeader = headers.map(header => `"${header}"`).join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      let cell = row[header] || '';
      
      cell = String(cell).replace(/"/g, '""');
      
      return `"${cell}"`;
    }).join(',');
  });
  
  return [csvHeader, ...csvRows].join('\n');
}

attachControlDiv();