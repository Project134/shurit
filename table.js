console.log('html');
// let table = new DataTable('#myTable');

// fetch('data.json').then(result => {console.log('success')}).catch(result=>{console.log('fail')})

document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    fileName = file.name.slice(0, file.name.lastIndexOf('.'));
    console.log(fileName)
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const jsonData = JSON.parse(e.target.result); // Parse the JSON content
            console.log(jsonData); // You can use jsonData as needed
            createCategoryTables(jsonData,fileName);
            

        };
        reader.readAsText(file); // Read file as text
        
    }
})

function addToLocalStorage(value){
    if(!localStorage.getItem('clickedItems')){
        let clickedItems = []
        localStorage.setItem('clickedItems', JSON.stringify(clickedItems))
        
    }
    clickedItems = JSON.parse(localStorage.getItem('clickedItems'));
    clickedItems.push(value)
    localStorage.setItem('clickedItems', JSON.stringify(clickedItems))
    console.log(localStorage.getItem('clickedItems'));
}

function createCategoryTables(data,fileName) {

    let clickedItems = JSON.parse(localStorage.getItem('clickedItems'));
    if(!clickedItems){
        addToLocalStorage('')
    }
    
    clickedItems = JSON.parse(localStorage.getItem('clickedItems'));

    const tablesContainer = document.getElementById('tablesContainer');
    
    const categories = {};
    data.forEach(item => {
        
        if (!categories[item.category]) {
            categories[item.category] = [];
        }
        categories[item.category].push(item);
    });


    for (const category in categories) {
        // Create table element
        const table = document.createElement('table');
        

        // class="table table-striped" style="width:100%"
        table.className = 'display table table-striped'; // DataTables requires class 'display'
        table.setAttribute('id', category.replace(/\s+/g, '-').toLowerCase()); // Create unique ID for the table

        // Create table header
        const headerRow = document.createElement('thead');
        const header = document.createElement('tr');
        
        const allColumns = Object.keys(categories[category][0]);
        const specialColumns = ['category','url']
        const tableColumns = allColumns.filter(item => !specialColumns.includes(item.toLowerCase()))
        console.log(specialColumns)


        for(let col of tableColumns){
            const th = document.createElement('th');
            th.textContent = col
            header.appendChild(th);
        }
        headerRow.appendChild(header);
        table.appendChild(headerRow);

        const tbody = document.createElement('tbody');

        const tableData = categories[category]
        

        for(let obj of tableData){
            const row = document.createElement('tr');
            
            uid = `${fileName}_${obj['id']}`
            row.setAttribute('id',uid)

            if(clickedItems.includes(uid)){
                row.classList.add("table-success"); 
            }
            row.onclick = function() {
                row.classList.toggle("table-success");
                window.open(obj['url'], '_blank');
                addToLocalStorage(row.getAttribute('id'));
            }
            
            for(let col of tableColumns){
                const td = document.createElement('td')
                td.textContent = obj[col]
                row.appendChild(td)            
            }
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        

        // Add table to container
        const categoryHeader = document.createElement('h2');
        categoryHeader.textContent = category; // Add category title above the table
        tablesContainer.appendChild(categoryHeader);
        tablesContainer.appendChild(table);
        
        // Initialize DataTable
        $(table).DataTable({paging:false});
    }


}
