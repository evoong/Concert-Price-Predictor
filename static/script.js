let allArtists = [];
let columns = [];
let visibleColumns = ['name', 'instagram_followers', 'spotify_followers', 'spotify_listeners', 'twitter_followers', 'updated_at'];
let sortCol = 'updated_at';
let sortDir = 'desc';
let draggedCol = null;
let selectedRows = new Set();

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

    // Paginate
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pagedData = filtered.slice(start, end);

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
    pageSize = parseInt(document.getElementById('page-size').value);
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
    sortAndRender();
    renderColumnPicker();
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
    return allArtists.filter(a => a.name.toLowerCase().includes(query));
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
    setTimeout(() => {
        fetchArtists();
        showToast(`Refresh complete for ${names.length} artist(s)`);
    }, 10000);
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
            showToast(`Scraper started for ${name}. This takes a few moments...`, 'info');
            setTimeout(() => {
                btn.innerHTML = '🔄';
                fetchArtists();
                showToast(`Data refreshed for ${name}`);
            }, 8000);
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
    btn.textContent = 'Triggering...';
    btn.disabled = true;

    showToast('Starting batch refresh (5 artists)...', 'info');

    // Trigger up to 5 to avoid overwhelming local resources
    for (let i = 0; i < Math.min(allArtists.length, 5); i++) {
        fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: allArtists[i].name })
        });
    }

    setTimeout(() => {
        btn.textContent = 'Refresh All';
        btn.disabled = false;
        fetchArtists();
        showToast('Global refresh check complete');
    }, 15000);
}

window.onclick = function (event) {
    if (!event.target.matches('.picker-btn')) {
        const d = document.getElementById('column-dropdown');
        if (d && d.style.display === 'block') d.style.display = 'none';
    }
}

fetchArtists();
setInterval(fetchArtists, 60000);
