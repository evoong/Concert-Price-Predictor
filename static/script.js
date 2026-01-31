let allArtists = [];
let columns = [];
let visibleColumns = ['name', 'instagram_followers', 'spotify_followers', 'spotify_listeners', 'twitter_followers', 'updated_at'];
let sortCol = 'updated_at';
let sortDir = 'desc';
let draggedCol = null;
let selectedRows = new Set();

// Column filtering
let columnFilters = {}; // { colName: { operator: string, value: string } }
const numericColumns = ['instagram_followers', 'spotify_followers', 'spotify_listeners', 'spotify_popularity', 'twitter_followers', 'stubhub_favourites'];

// Map columns to their data source for refresh
const columnToSource = {
    'instagram_followers': 'instagram',
    'instagram_username': 'instagram',
    'spotify_followers': 'spotify',
    'spotify_listeners': 'spotify',
    'spotify_popularity': 'spotify',
    'spotify_id': 'spotify',
    'spotify_genre': 'spotify',
    'twitter_followers': 'twitter',
    'twitter_username': 'twitter',
    'stubhub_favourites': 'stubhub',
    'stubhub_url': 'stubhub'
};

const numericOperators = [
    { value: '', label: 'No filter' },
    { value: '>', label: 'Greater than' },
    { value: '>=', label: 'Greater or equal' },
    { value: '<', label: 'Less than' },
    { value: '<=', label: 'Less or equal' },
    { value: '=', label: 'Equals' },
    { value: 'null', label: 'Is null' }
];

const textOperators = [
    { value: '', label: 'No filter' },
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts', label: 'Starts with' },
    { value: 'ends', label: 'Ends with' },
    { value: 'null', label: 'Is null' }
];

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'error' ? '❌' : type === 'info' ? 'ℹ️' : '✅'}</span> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// Poll for refresh completion by checking updated_at timestamps
function waitForRefresh(artistNames, successMsg, maxWaitMs = 120000) {
    return new Promise((resolve) => {
        // Get current timestamps
        const originalTimestamps = {};
        artistNames.forEach(name => {
            const artist = allArtists.find(a => a.name === name);
            if (artist) originalTimestamps[name] = artist.updated_at;
        });

        const pollInterval = 3000; // Check every 3 seconds
        let elapsed = 0;
        let completed = new Set();

        const poll = async () => {
            if (elapsed >= maxWaitMs) {
                showToast(`Refresh taking longer than expected. Check back later.`, 'info');
                fetchArtists();
                resolve();
                return;
            }

            try {
                const response = await fetch('/api/artists');
                const data = await response.json();
                if (data.error) throw new Error(data.error);

                // Check which artists have been updated
                artistNames.forEach(name => {
                    if (completed.has(name)) return;
                    const artist = data.find(a => a.name === name);
                    if (artist && artist.updated_at !== originalTimestamps[name]) {
                        completed.add(name);
                    }
                });

                if (completed.size === artistNames.length) {
                    // All done
                    allArtists = data;
                    sortAndRender();
                    renderRecentList();
                    showToast(successMsg);
                    resolve();
                    return;
                }

                // Continue polling
                elapsed += pollInterval;
                setTimeout(poll, pollInterval);
            } catch (e) {
                console.error('Polling error:', e);
                elapsed += pollInterval;
                setTimeout(poll, pollInterval);
            }
        };

        // Start polling after initial delay
        setTimeout(poll, pollInterval);
    });
}

// Pagination State
let currentPage = 1;
let pageSize = 50;

async function fetchArtists() {
    try {
        const response = await fetch('/api/artists');
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        allArtists = data;

        if (columns.length === 0 && data.length > 0) {
            columns = Object.keys(data[0]);
            renderColumnPicker();
            renderFilters();
        }

        sortAndRender();
        renderRecentList();
    } catch (error) {
        console.error('Fetch Error:', error);
        document.getElementById('artist-tbody').innerHTML = `<tr><td colspan="10" style="text-align:center;color:#ff4d4d;padding:2rem;">Error: ${error.message}</td></tr>`;
    }
}

function handleSort(col) {
    if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        sortCol = col;
        sortDir = 'asc';
    }
    sortAndRender();
}

function sortAndRender() {
    const query = document.getElementById('artist-filter').value.toLowerCase();
    let filtered = allArtists.filter(a => a.name.toLowerCase().includes(query));

    // Apply column filters
    filtered = applyColumnFilters(filtered);

    document.getElementById('view-title').textContent = query ? `Results for "${query}"` : 'Artists';

    // Sort
    filtered.sort((a, b) => {
        let v1 = a[sortCol];
        let v2 = b[sortCol];

        if (v1 === null || v1 === undefined) return 1;
        if (v2 === null || v2 === undefined) return -1;

        if (typeof v1 === 'string') {
            v1 = v1.toLowerCase();
            v2 = (v2 || "").toLowerCase();
        }

        if (v1 < v2) return sortDir === 'asc' ? -1 : 1;
        if (v1 > v2) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    // Paginate (pageSize = 0 means show all)
    let pagedData;
    let totalPages;
    if (pageSize === 0) {
        pagedData = filtered;
        totalPages = 1;
        currentPage = 1;
    } else {
        totalPages = Math.ceil(filtered.length / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        pagedData = filtered.slice(start, end);
    }

    updatePaginationControls(filtered.length, totalPages);
    renderTable(pagedData);
}

function updatePaginationControls(totalItems, totalPages) {
    const indicator = document.getElementById('page-indicator');
    indicator.textContent = `Page ${currentPage} of ${totalPages} (${totalItems} artists)`;

    const prevBtn = document.querySelector('.nav-btn[onclick="prevPage()"]');
    const nextBtn = document.querySelector('.nav-btn[onclick="nextPage()"]');

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

function nextPage() {
    currentPage++;
    sortAndRender();
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        sortAndRender();
    }
}

function changePageSize() {
    const val = document.getElementById('page-size').value;
    pageSize = val === 'all' ? 0 : parseInt(val);
    currentPage = 1;
    sortAndRender();
}

function renderColumnPicker() {
    const dropdown = document.getElementById('column-dropdown');
    dropdown.innerHTML = '';

    columns.forEach(col => {
        const checked = visibleColumns.includes(col) ? 'checked' : '';
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" ${checked} onchange="toggleColumn('${col}')">
            ${formatLabel(col)}
        `;
        dropdown.appendChild(label);
    });
}

function toggleColumn(col) {
    if (visibleColumns.includes(col)) {
        visibleColumns = visibleColumns.filter(c => c !== col);
    } else {
        visibleColumns.push(col);
    }
    renderFilters();
    sortAndRender();
}

function formatLabel(str) {
    return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function toggleColumnPicker() {
    const d = document.getElementById('column-dropdown');
    d.style.display = d.style.display === 'block' ? 'none' : 'block';
}

function handleDragStart(e, col) {
    draggedCol = col;
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e, th) {
    e.preventDefault();
    th.classList.add('drag-over');
}

function handleDragLeave(e, th) {
    th.classList.remove('drag-over');
}

function handleDrop(e, targetCol) {
    e.preventDefault();
    if (draggedCol && draggedCol !== targetCol) {
        const fromIdx = visibleColumns.indexOf(draggedCol);
        const toIdx = visibleColumns.indexOf(targetCol);

        visibleColumns.splice(fromIdx, 1);
        visibleColumns.splice(toIdx, 0, draggedCol);

        sortAndRender();
    }
    draggedCol = null;
    document.querySelectorAll('th').forEach(th => th.classList.remove('drag-over'));
}

function getSafeId(name) {
    return 'id-' + btoa(name).replace(/[^a-zA-Z0-9]/g, '');
}

function removeColumn(col) {
    visibleColumns = visibleColumns.filter(c => c !== col);
    delete columnFilters[col]; // Remove filter for removed column
    renderFilters();
    renderColumnPicker();
    sortAndRender();
}

async function refreshColumn(col) {
    const source = columnToSource[col];
    if (!source) {
        showToast(`No data source for ${formatLabel(col)}`, 'error');
        return;
    }

    // Refresh for selected rows, or all filtered rows if none selected
    let artists = selectedRows.size > 0 ? [...selectedRows] : getFilteredArtists().map(a => a.name);

    if (artists.length === 0) {
        showToast('No artists to refresh', 'error');
        return;
    }

    if (artists.length > 10) {
        if (!confirm(`Refresh ${source} for ${artists.length} artists? This may take a while.`)) return;
    }

    showToast(`Refreshing ${source} for ${artists.length} artist(s)...`, 'info');

    for (const name of artists) {
        fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, source })
        });
    }

    waitForRefresh(artists, `${formatLabel(source)} refresh complete`);
}

// Filter functions
function applyColumnFilters(data) {
    return data.filter(row => {
        for (const col of Object.keys(columnFilters)) {
            const filter = columnFilters[col];
            if (!filter || !filter.operator) continue;

            const cellVal = row[col];
            const filterVal = filter.value;

            // Handle "is null" operator
            if (filter.operator === 'null') {
                if (cellVal !== null && cellVal !== undefined && cellVal !== '') {
                    return false;
                }
                continue;
            }

            // Skip if no filter value provided
            if (!filterVal && filterVal !== 0) continue;

            // Numeric filtering
            if (numericColumns.includes(col)) {
                const numCell = parseFloat(cellVal);
                const numFilter = parseFloat(filterVal);

                if (isNaN(numCell)) return false;

                switch (filter.operator) {
                    case '>': if (!(numCell > numFilter)) return false; break;
                    case '>=': if (!(numCell >= numFilter)) return false; break;
                    case '<': if (!(numCell < numFilter)) return false; break;
                    case '<=': if (!(numCell <= numFilter)) return false; break;
                    case '=': if (!(numCell === numFilter)) return false; break;
                }
            } else {
                // Text filtering (case-insensitive)
                const strCell = (cellVal || '').toString().toLowerCase();
                const strFilter = filterVal.toLowerCase();

                switch (filter.operator) {
                    case 'equals': if (strCell !== strFilter) return false; break;
                    case 'contains': if (!strCell.includes(strFilter)) return false; break;
                    case 'starts': if (!strCell.startsWith(strFilter)) return false; break;
                    case 'ends': if (!strCell.endsWith(strFilter)) return false; break;
                }
            }
        }
        return true;
    });
}

function handleFilterChange(col, operator, value) {
    if (!operator) {
        delete columnFilters[col];
    } else {
        columnFilters[col] = { operator, value: value || '' };
    }
    updateClearFiltersBtn();

    // Auto-switch to "All rows" when any filter is active
    const hasFilters = Object.keys(columnFilters).some(c => columnFilters[c] && columnFilters[c].operator);
    if (hasFilters) {
        pageSize = 0;
        document.getElementById('page-size').value = 'all';
    }

    currentPage = 1;
    sortAndRender();
}

function clearAllFilters() {
    columnFilters = {};
    renderFilters();
    updateClearFiltersBtn();
    currentPage = 1;
    sortAndRender();
}

function updateClearFiltersBtn() {
    const btn = document.getElementById('clear-filters-btn');
    const hasFilters = Object.keys(columnFilters).some(col => columnFilters[col] && columnFilters[col].operator);
    if (btn) btn.style.display = hasFilters ? 'block' : 'none';
}

function renderFilters() {
    const container = document.getElementById('filter-list');
    if (!container) return;
    container.innerHTML = '';

    visibleColumns.forEach(col => {
        const isNumeric = numericColumns.includes(col);
        const operators = isNumeric ? numericOperators : textOperators;
        const currentFilter = columnFilters[col] || {};

        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';

        const label = document.createElement('label');
        label.className = 'filter-label';
        label.textContent = formatLabel(col);
        filterItem.appendChild(label);

        const select = document.createElement('select');
        select.className = 'filter-select';
        operators.forEach(op => {
            const option = document.createElement('option');
            option.value = op.value;
            option.textContent = op.label;
            if (currentFilter.operator === op.value) option.selected = true;
            select.appendChild(option);
        });

        const input = document.createElement('input');
        input.type = isNumeric ? 'number' : 'text';
        input.className = 'filter-input';
        input.placeholder = isNumeric ? '0' : 'Value...';
        input.value = currentFilter.value || '';
        if (!currentFilter.operator || currentFilter.operator === 'null') {
            input.style.display = 'none';
        }

        select.onchange = () => {
            if (select.value === 'null' || select.value === '') {
                input.style.display = 'none';
                input.value = '';
            } else {
                input.style.display = 'block';
            }
            handleFilterChange(col, select.value, input.value);
        };

        input.oninput = () => {
            handleFilterChange(col, select.value, input.value);
        };

        filterItem.appendChild(select);
        filterItem.appendChild(input);
        container.appendChild(filterItem);
    });

    updateClearFiltersBtn();
}

function toggleRowSelection(name) {
    if (selectedRows.has(name)) {
        selectedRows.delete(name);
    } else {
        selectedRows.add(name);
    }
    updateBulkActionsBar();
    updateCheckboxStates();
}

function toggleSelectAll(checked) {
    const visibleArtists = getFilteredArtists();
    if (checked) {
        visibleArtists.forEach(a => selectedRows.add(a.name));
    } else {
        selectedRows.clear();
    }
    updateBulkActionsBar();
    updateCheckboxStates();
}

function getFilteredArtists() {
    const query = document.getElementById('artist-filter').value.toLowerCase();
    let filtered = allArtists.filter(a => a.name.toLowerCase().includes(query));
    return applyColumnFilters(filtered);
}

function updateCheckboxStates() {
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = selectedRows.has(cb.dataset.name);
    });
    const selectAllCb = document.getElementById('select-all-cb');
    if (selectAllCb) {
        const visibleArtists = getFilteredArtists();
        selectAllCb.checked = visibleArtists.length > 0 && visibleArtists.every(a => selectedRows.has(a.name));
    }
}

function updateBulkActionsBar() {
    let bar = document.getElementById('bulk-actions-bar');
    if (selectedRows.size === 0) {
        if (bar) bar.style.display = 'none';
        return;
    }
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'bulk-actions-bar';
        bar.className = 'bulk-actions-bar';
        document.querySelector('.content-wrapper').prepend(bar);
    }
    bar.style.display = 'flex';
    bar.innerHTML = `
        <span class="bulk-count">${selectedRows.size} selected</span>
        <button class="bulk-btn bulk-refresh" onclick="bulkRefresh()">🔄 Refresh Selected</button>
        <button class="bulk-btn bulk-delete" onclick="bulkDelete()">🗑️ Delete Selected</button>
        <button class="bulk-btn bulk-clear" onclick="clearSelection()">✕ Clear</button>
    `;
}

function clearSelection() {
    selectedRows.clear();
    updateBulkActionsBar();
    updateCheckboxStates();
}

async function bulkDelete() {
    const count = selectedRows.size;
    if (!confirm(`Delete ${count} artist(s)? This cannot be undone.`)) return;

    const names = [...selectedRows];
    let deleted = 0;
    for (const name of names) {
        try {
            const res = await fetch('/api/delete_artist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (res.ok) deleted++;
        } catch (e) { }
    }
    selectedRows.clear();
    showToast(`Deleted ${deleted} artist(s)`);
    fetchArtists();
}

async function bulkRefresh() {
    const names = [...selectedRows];
    showToast(`Starting refresh for ${names.length} artist(s)...`, 'info');
    for (const name of names) {
        fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
    }
    waitForRefresh(names, `Refresh complete for ${names.length} artist(s)`);
}

function renderTable(artists) {
    const thead = document.getElementById('table-head');
    const tbody = document.getElementById('artist-tbody');

    thead.innerHTML = '';

    // Checkbox column header
    const checkTh = document.createElement('th');
    checkTh.className = 'checkbox-col';
    const selectAllCb = document.createElement('input');
    selectAllCb.type = 'checkbox';
    selectAllCb.id = 'select-all-cb';
    selectAllCb.title = 'Select all';
    selectAllCb.onchange = () => toggleSelectAll(selectAllCb.checked);
    checkTh.appendChild(selectAllCb);
    thead.appendChild(checkTh);

    visibleColumns.forEach(col => {
        const th = document.createElement('th');
        th.draggable = true;

        const labelSpan = document.createElement('span');
        labelSpan.textContent = formatLabel(col);
        labelSpan.className = 'col-label';
        th.appendChild(labelSpan);

        // Refresh button (only for columns with data source)
        if (columnToSource[col]) {
            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'col-refresh-btn';
            refreshBtn.textContent = '🔄';
            refreshBtn.title = `Refresh ${columnToSource[col]} data`;
            refreshBtn.onclick = (e) => {
                e.stopPropagation();
                refreshColumn(col);
            };
            th.appendChild(refreshBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'col-remove-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove column';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeColumn(col);
        };
        th.appendChild(removeBtn);

        th.onclick = (e) => {
            if (e.target === th || e.target === labelSpan) handleSort(col);
        };

        th.ondragstart = (e) => handleDragStart(e, col);
        th.ondragover = (e) => handleDragOver(e, th);
        th.ondragleave = (e) => handleDragLeave(e, th);
        th.ondrop = (e) => handleDrop(e, col);

        if (sortCol === col) {
            th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
        thead.appendChild(th);
    });
    thead.appendChild(document.createElement('th'));

    tbody.innerHTML = '';
    artists.forEach(artist => {
        const sid = getSafeId(artist.name);
        const tr = document.createElement('tr');
        tr.id = `row-${sid}`;

        // Checkbox cell
        const checkTd = document.createElement('td');
        checkTd.className = 'checkbox-col';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'row-checkbox';
        cb.dataset.name = artist.name;
        cb.checked = selectedRows.has(artist.name);
        cb.onchange = () => toggleRowSelection(artist.name);
        checkTd.appendChild(cb);
        tr.appendChild(checkTd);

        visibleColumns.forEach(col => {
            const td = document.createElement('td');
            // Only name and timestamps are truly read-only
            if (col === 'updated_at' || col === 'created_at' || col === 'name' || col === 'last_error') {
                let content = artist[col] || '--';
                let style = col === 'name' ? 'font-weight:700;' : '';
                if (col === 'last_error' && artist[col]) {
                    style += 'color: #ff4d4d; font-size: 0.8rem;';
                }
                td.innerHTML = `<span style="${style}" title="${content}">${content}</span>`;
            } else {
                td.innerHTML = `<input type="text" class="stat-val-input" value="${artist[col] || ''}" 
                                  data-field="${col}" onchange="markDirty('${sid}')">`;
            }
            tr.appendChild(td);
        });

        const actTd = document.createElement('td');
        actTd.className = 'actions-cell';
        actTd.innerHTML = `
            <button class="mini-btn" onclick="refreshArtist('${artist.name}', this)" title="Refresh from Scrapers">🔄</button>
            <button class="mini-btn btn-save" style="display:none; color: var(--spotify-green);"
                    id="save-${sid}" onclick="saveChanges('${artist.name}', '${sid}', this)" title="Save Changes">💾</button>
            <button class="mini-btn btn-delete" onclick="deleteArtist('${artist.name}', this)" title="Delete Artist">🗑️</button>
        `;
        tr.appendChild(actTd);
        tbody.appendChild(tr);
    });

    updateBulkActionsBar();
}

function filterArtists() {
    currentPage = 1; // Reset to page 1 on filter
    sortAndRender();
}

function markDirty(sid) {
    const saveBtn = document.getElementById(`save-${sid}`);
    if (saveBtn) saveBtn.style.display = 'block';
}

async function saveChanges(name, sid, btn) {
    const row = document.getElementById(`row-${sid}`);
    const inputs = row.querySelectorAll('.stat-val-input');
    const data = { name: name };

    inputs.forEach(input => {
        data[input.dataset.field] = input.value;
    });

    btn.innerHTML = '...';

    try {
        const response = await fetch('/api/update_artist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            btn.style.display = 'none';
            btn.innerHTML = '💾';
            row.style.background = 'rgba(29, 185, 84, 0.1)';
            setTimeout(() => row.style.background = '', 2000);
            showToast(`Saved changes for ${name}`);
        } else {
            const err = await response.json();
            showToast(err.error || 'Failed to save changes', 'error');
            btn.innerHTML = '💾';
        }
    } catch (error) {
        console.error('Update failed:', error);
        showToast('Connection error during save', 'error');
        btn.innerHTML = '❌';
    }
}

async function deleteArtist(name, btn) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    btn.innerHTML = '...';
    try {
        const res = await fetch('/api/delete_artist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        });
        if (res.ok) {
            showToast(`Deleted ${name}`);
            fetchArtists();
        } else {
            const err = await res.json();
            showToast(err.error || 'Failed to delete', 'error');
            btn.innerHTML = '🗑️';
        }
    } catch (e) {
        showToast('Network error during delete', 'error');
        btn.innerHTML = '🗑️';
    }
}

async function refreshArtist(name, btn) {
    btn.innerHTML = '<span class="loading" style="font-size: 0.8rem;">🔄</span>';
    try {
        const res = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        });
        if (res.ok) {
            showToast(`Scraper started for ${name}...`, 'info');
            waitForRefresh([name], `Data refreshed for ${name}`).finally(() => {
                btn.innerHTML = '🔄';
            });
        } else {
            const err = await res.json();
            showToast(err.error || 'Scraper failed to start', 'error');
            btn.innerHTML = '🔄';
        }
    } catch (e) {
        showToast('Network error triggering scraper', 'error');
        btn.innerHTML = '🔄';
    }
}

function renderRecentList() {
    const list = document.getElementById('recent-list');
    list.innerHTML = '';
    // Use the first 5 records from allArtists (sorted newest first by DB)
    allArtists.slice(0, 5).forEach(a => {
        const item = document.createElement('p');
        item.style.fontSize = '0.9rem';
        item.style.padding = '0.2rem 0';
        item.style.color = 'var(--text-subdued)';
        item.textContent = a.name;
        list.appendChild(item);
    });
}

async function refreshAll() {
    const btn = document.querySelector('.spotify-btn');
    btn.textContent = 'Refreshing...';
    btn.disabled = true;

    const count = Math.min(allArtists.length, 5);
    const names = allArtists.slice(0, count).map(a => a.name);

    showToast(`Starting batch refresh (${count} artists)...`, 'info');

    for (const name of names) {
        fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
    }

    waitForRefresh(names, `Batch refresh complete for ${count} artist(s)`).finally(() => {
        btn.textContent = 'Refresh All';
        btn.disabled = false;
    });
}

window.onclick = function (event) {
    if (!event.target.matches('.picker-btn')) {
        const d = document.getElementById('column-dropdown');
        if (d && d.style.display === 'block') d.style.display = 'none';
    }
}

fetchArtists();
setInterval(fetchArtists, 60000);
