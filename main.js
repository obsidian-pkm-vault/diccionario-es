const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

let debounceTimer = null;

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
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await response.json();
    displayMatchingWords(results);
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
    const response = await fetch(`/api/entry/${entryId}`);
    if (!response.ok) {
        searchResults.innerHTML = '<p class="no-results">Palabra no encontrada.</p>';
        return;
    }
    const entry = await response.json();
    searchResults.innerHTML = renderEntry(entry);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function renderLeafExtras(leaf) {
    let html = '';
    if (leaf.examples?.length) {
        html += `<ul class="examples">${leaf.examples.map((ex) => `<li>&ldquo;${escapeHtml(ex)}&rdquo;</li>`).join('')}</ul>`;
    }
    if (leaf.synonyms?.length) {
        html += `<p class="tag-line"><strong>Sinónimos:</strong> ${leaf.synonyms.map(escapeHtml).join(', ')}</p>`;
    }
    if (leaf.crossReferences?.length) {
        html += `<p class="tag-line"><strong>Véase también:</strong> ${leaf.crossReferences.map(escapeHtml).join(', ')}</p>`;
    }
    if (leaf.antonym) {
        html += `<p class="tag-line"><strong>Antónimo:</strong> ${escapeHtml(leaf.antonym)}</p>`;
    }
    if (leaf.catalog?.length) {
        html += `<ul class="catalog">${leaf.catalog.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }
    return html;
}

function renderSubsense(subsense) {
    return `
        <li class="subsense">
            <p>${escapeHtml(subsense.definition)}</p>
            ${renderLeafExtras(subsense)}
        </li>
    `;
}

function renderSense(sense) {
    return `
        <li class="sense">
            <p><span class="sense-number">${sense.number}.</span> ${escapeHtml(sense.definition)}</p>
            ${renderLeafExtras(sense)}
            ${sense.subsenses?.length ? `<ul class="subsenses">${sense.subsenses.map(renderSubsense).join('')}</ul>` : ''}
        </li>
    `;
}

function renderExpressions(expressions) {
    if (!expressions?.length) return '';
    const items = expressions
        .map(
            (expression) => `
                <div class="expression">
                    <h3>${escapeHtml(expression.phrase)}</h3>
                    <ol class="senses">${expression.senses.map(renderSense).join('')}</ol>
                </div>
            `,
        )
        .join('');
    return `<div class="expressions"><h2>Expresiones</h2>${items}</div>`;
}

function renderEnrichment(enrichment) {
    if (!enrichment) return '';
    const rows = [
        ['Etimología', enrichment.etymology?.join(', ')],
        ['Categoría', enrichment.partOfSpeech?.join(', ')],
        ['Área de uso', enrichment.usageArea?.join(', ')],
        ['Nivel de uso', enrichment.usageLevel?.join(', ')],
        ['Nombre científico', enrichment.scientificName],
        ['Conjugación', enrichment.conjugation],
        ['Sinónimos (Lucene)', enrichment.synonymsLucene?.length ? enrichment.synonymsLucene.join(', ') : null],
    ].filter(([, value]) => value);

    if (rows.length === 0 && !enrichment.usageNotes) return '';

    const rowsHtml = rows.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`).join('');
    const notas = enrichment.usageNotes ? `<p class="notas-uso">${escapeHtml(enrichment.usageNotes)}</p>` : '';
    return `<div class="enrichment">${rowsHtml}${notas}</div>`;
}

function renderEntry(entry) {
    const types = Array.isArray(entry.types) ? entry.types.join(', ') : entry.types || '';
    const typesHtml = types ? `<span class="word-types">${escapeHtml(types)}</span>` : '';

    return `
        <div class="word-result">
            <div class="word-header">
                <h1>${escapeHtml(entry.lemma)}</h1>
                ${typesHtml}
            </div>
            <ol class="senses">${entry.senses.map(renderSense).join('')}</ol>
            ${renderExpressions(entry.expressions)}
            ${renderEnrichment(entry.enrichment)}
        </div>
    `;
}
