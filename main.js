const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

window.dictionaryData = [];

// Fetch dictionary data from the JSONL file
fetch('data/diccionario-maria-moliner.jsonl')
    .then(response => response.text())
    .then(text => {
        // Parse JSONL format (each line is a separate JSON object)
        const lines = text.trim().split('\n');
        const data = lines.map(line => {
            const obj = JSON.parse(line);
            return {
                word: obj.lemma,
                definition: obj.definition,
                ...obj // Include all original fields
            };
        });
        
        // Store the dictionary data globally
        window.dictionaryData = data;

        // Event listener for the input field
        searchInput.addEventListener('input', function() {
            const searchWord = searchInput.value.toLowerCase();
            const matchingWords = dictionaryData.filter(wordObj => wordObj.word.toLowerCase().startsWith(searchWord));

            // Display the matching words
            displayMatchingWords(matchingWords);
        });
    })
    .catch(error => console.error('Error fetching dictionary data:', error));

function searchDictionary() {
    const searchWord = searchInput.value.toLowerCase();
    const result = dictionaryData.find(wordObj => wordObj.word.toLowerCase() === searchWord);

    if (result) {
        displayWord(result);
    } else {
        searchResults.innerHTML = '<p>Word not found.</p>';
    }
}

function displayWord(wordObj) {
    const types = Array.isArray(wordObj.types) ? wordObj.types.join(', ') : wordObj.types || '';
    const typesHtml = types ? `<span class="word-types">${types}</span>` : '';
    const metaHtml = wordObj.initialMeta ? `<p class="word-meta"><strong>Meta:</strong> ${wordObj.initialMeta}</p>` : '';
    const sourceHtml = wordObj.source ? `<p class="word-source"><small>Source: ${wordObj.source}</small></p>` : '';
    
    const wordPage = `
        <div class="word-result">
            <div class="word-header">
                <h1>${wordObj.lemma}</h1>
                ${typesHtml}
            </div>
            ${metaHtml}
            <div class="word-definition">
                <p>${wordObj.definition}</p>
            </div>
            ${sourceHtml}
        </div>
    `;
    searchResults.innerHTML = wordPage;
}

// Function to display matching words
function displayMatchingWords(words) {
    const listItems = words.map((wordObj, index) => `<li class="word-item" data-word-index="${index}">${wordObj.word}</li>`).join('');
    searchResults.innerHTML = `<ul class="search-list">${listItems}</ul>`;
    
    // Add event listeners to word items
    document.querySelectorAll('.word-item').forEach(item => {
        item.addEventListener('click', function() {
            const wordIndex = this.getAttribute('data-word-index');
            const selectedWord = words[wordIndex];
            if (selectedWord) {
                displayWord(selectedWord);
            }
        });
    });
}
