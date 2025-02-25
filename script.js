function createPopup() {
    if (document.getElementById('divCountPopup')){
        // (document.getElementById('divCountPopup')).innerText = "Start";
        return null;
    }

    const popupDiv = document.createElement('div');
    popupDiv.style.position = 'fixed';
    popupDiv.style.right = '10px';
    popupDiv.style.top = '10px';
    popupDiv.style.padding = '10px';
    // popupDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';

    popupDiv.style.backgroundColor = '#edd1b0'; // Set background to black
    popupDiv.style.color = 'black';
    popupDiv.style.fontWeight = 'bold';
    popupDiv.style.border = '1px solid #ccc';
    popupDiv.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)';
    popupDiv.style.zIndex = '10000'; // High z-index to overlay on other elements
    popupDiv.id = 'divCountPopup'; // Add an ID for easy reference
    popupDiv.innerText = "Start";
    popupDiv.style.left = '50%';
    popupDiv.style.transform = 'translateX(-50%)';
    popupDiv.style.top = '10px';

    document.body.appendChild(popupDiv);
    
};

function updateCount() {
    console.log('update count executed!');
    let job = document.getElementsByClassName('t-24 job-details-jobs-unified-top-card__job-title')[0]?.innerText || 'No data'
    let company = document.getElementsByClassName('job-details-jobs-unified-top-card__company-name')[0]?.innerText || 'No data'
    let jd = document.getElementsByClassName('jobs-description__container')[0]?.innerText || 'No data'
    let empCount = document.getElementsByClassName('jobs-company__inline-information')[0]?.innerText || 'No data'
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

    (document.getElementById('divCountPopup')).innerText = `${job} \nCompany - ${company} \nEmpcount - ${empCount}\n\n ${matchingSentences.join('\n')}`; // Update the text
};


function lookForChanges(){
    let timer;

    const debounceUpdate = () => {
        clearTimeout(timer);
        timer = setTimeout(updateCount,1);

    }
    
    const observer = new MutationObserver(debounceUpdate);
    observer.observe(document.getElementsByClassName('jobs-details__main-content')[0],{ childList: true, subtree: true });

};

function dummy(){
    console.log('hello');
};

function nextItem(){
    updateCount()
    let curJobID = document.getElementsByClassName("job-details-jobs-unified-top-card__title-container")[0].getElementsByTagName('a')[0].getAttribute('href').split("/")[3]

    let allTiles = document.getElementsByClassName('scaffold-layout__list')[0].children[1].querySelectorAll('li.ember-view')

    for(const tile of allTiles){
        tileJobID = tile.getAttribute("data-occludable-job-id")
        if (tileJobID == curJobID){
            if (!(tile.nextElementSibling)){
                document.getElementById('divCountPopup').innerText = 'Go to Next Page';
            };
            tile.nextElementSibling.getElementsByTagName('a')[0].click();
            setTimeout(() => {}, 1000);

            updateCount();
            break;
        }
    };

    
};

function execute(){
    
    createPopup(); // Create the popup if it doesn't exist
    updateCount();
    lookForChanges();
    document.getElementById('divCountPopup').addEventListener('click', nextItem)
};

execute();







          
          

