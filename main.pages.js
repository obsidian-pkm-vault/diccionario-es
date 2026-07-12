// GitHub Pages entry point: no server, queries a gzipped SQLite database
// loaded fully client-side via sql.js (WASM). Rendering logic lives in
// render.js; SQL queries live in browser-sqlite-reader.js (shared shape
// with scripts/lib/mm-sqlite-reader.mjs).

const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const dbStatus = document.getElementById('dbStatus');

const SEARCH_LIMIT = 30;
const DB_URL = 'data/diccionario-maria-moliner.sqlite.gz';

let debounceTimer = null;
let db = null;

const dbReady = loadDatabase().then((loadedDb) => {
    db = loadedDb;
    dbStatus.remove();
    searchInput.disabled = false;
    searchInput.focus();
}).catch((error) => {
    console.error(error);
    dbStatus.textContent = 'No se pudo cargar el diccionario. Recarga la página o prueba con otro navegador.';
});

async function loadDatabase() {
    const response = await fetch(DB_URL);
    if (!response.ok) throw new Error(`No se pudo descargar ${DB_URL}: ${response.status}`);

    const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
    const buffer = await new Response(decompressed).arrayBuffer();

    const SQL = await initSqlJs({ locateFile: (file) => `vendor/sql.js/${file}` });
    return new SQL.Database(new Uint8Array(buffer));
}

searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();
    if (!query) {
        searchResults.innerHTML = '';
        return;
    }
    debounceTimer = setTimeout(() => runSearch(query), 150);
});

async function runSearch(query) {
    await dbReady;
    displayMatchingWords(searchEntries(db, query, SEARCH_LIMIT));
}

function searchDictionary() {
    const query = searchInput.value.trim();
    if (!query) return;
    runSearch(query);
}

function displayMatchingWords(results) {
    if (results.length === 0) {
        searchResults.innerHTML = '<p class="no-results">No se encontraron palabras.</p>';
        return;
    }

    const listItems = results
        .map((result) => `<li class="word-item" data-entry-id="${result.id}">${escapeHtml(result.header || result.lemma)}</li>`)
        .join('');
    searchResults.innerHTML = `<ul class="search-list">${listItems}</ul>`;

    document.querySelectorAll('.word-item').forEach((item) => {
        item.addEventListener('click', () => displayWord(Number(item.dataset.entryId)));
    });
}

async function displayWord(entryId) {
    await dbReady;
    const entry = getEntryDetail(db, entryId);
    if (!entry) {
        searchResults.innerHTML = '<p class="no-results">Palabra no encontrada.</p>';
        return;
    }
    searchResults.innerHTML = renderEntry(entry);
}
