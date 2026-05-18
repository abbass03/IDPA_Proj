/* ═══════════════════════════════════════════════════════════════════════
   PROJECT 1  —  Comparison
   ═══════════════════════════════════════════════════════════════════════ */

const state = {
    options: null,
    result: null,
    activeArtifact: "tree1_json",
};

const elements = {
    modeSelect:       document.getElementById("modeSelect"),
    methodSelect:     document.getElementById("methodSelect"),
    file1Select:      document.getElementById("file1Select"),
    file2Select:      document.getElementById("file2Select"),
    compareButton:    document.getElementById("compareButton"),
    swapButton:       document.getElementById("swapButton"),
    statusPill:       document.getElementById("statusPill"),
    distanceValue:    document.getElementById("distanceValue"),
    similarityValue:  document.getElementById("similarityValue"),
    patchValue:       document.getElementById("patchValue"),
    opsValue:         document.getElementById("opsValue"),
    tree1Nodes:       document.getElementById("tree1Nodes"),
    tree2Nodes:       document.getElementById("tree2Nodes"),
    insertCount:      document.getElementById("insertCount"),
    deleteCount:      document.getElementById("deleteCount"),
    updateCount:      document.getElementById("updateCount"),
    reportView:       document.getElementById("reportView"),
    sourcePreview:    document.getElementById("sourcePreview"),
    targetPreview:    document.getElementById("targetPreview"),
    operationsList:   document.getElementById("operationsList"),
    opsSubtitle:      document.getElementById("opsSubtitle"),
    tree1View:        document.getElementById("tree1View"),
    tree2View:        document.getElementById("tree2View"),
    patchedTreeView:  document.getElementById("patchedTreeView"),
    artifactView:     document.getElementById("artifactView"),
};

function setStatus(label, kind) {
    elements.statusPill.textContent = label;
    elements.statusPill.className = `status-pill ${kind}`;
}

function fillSelect(select, values) {
    select.innerHTML = "";
    values.forEach(value => {
        const o = document.createElement("option");
        o.value = o.textContent = value;
        select.appendChild(o);
    });
}

async function fetchTextPreview(relativePath) {
    if (!relativePath) return "No file selected.";
    const r = await fetch(`/api/file?path=${encodeURIComponent(relativePath)}`);
    return r.ok ? r.text() : "Could not load file preview.";
}

async function refreshPreviews() {
    const [src, tgt] = await Promise.all([
        fetchTextPreview(elements.file1Select.value),
        fetchTextPreview(elements.file2Select.value),
    ]);
    elements.sourcePreview.textContent = src;
    elements.targetPreview.textContent = tgt;
    elements.sourcePreview.classList.remove("empty-state");
    elements.targetPreview.classList.remove("empty-state");
}

function updateFileChoices() {
    const mode = elements.modeSelect.value;
    const files = state.options.modes[mode].files;
    fillSelect(elements.file1Select, files);
    fillSelect(elements.file2Select, files);
    if (files.length > 1) elements.file2Select.selectedIndex = 1;
    refreshPreviews();
}

function renderTreeNode(node, depth = 0) {
    const container = document.createElement("div");
    container.className = "tree-node";
    container.style.marginLeft = `${depth * 10}px`;
    const line = document.createElement("div");
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = node.label;
    line.appendChild(label);
    const meta = document.createElement("span");
    meta.className = "tree-meta";
    meta.textContent = `[${node.node_type}]`;
    line.appendChild(meta);
    if (node.value !== null && node.value !== undefined) {
        const val = document.createElement("span");
        val.className = "tree-meta tree-value";
        val.textContent = ` = ${node.value}`;
        line.appendChild(val);
    }
    container.appendChild(line);
    (node.children || []).forEach(c => container.appendChild(renderTreeNode(c, depth + 1)));
    return container;
}

function renderOperations(ops) {
    elements.operationsList.innerHTML = "";
    if (!ops || ops.length === 0) {
        elements.operationsList.textContent = "No visible operations.";
        elements.operationsList.classList.add("empty-state");
        return;
    }
    elements.operationsList.classList.remove("empty-state");
    ops.forEach(op => {
        const card = document.createElement("div");
        card.className = "operation-card";
        const header = document.createElement("div");
        header.className = "operation-header";
        const kind = document.createElement("div");
        kind.className = "op-kind";
        kind.textContent = op.op || "operation";
        const path = document.createElement("div");
        path.className = "op-path";
        path.textContent = op.path || op.source_ref || op.parent_ref || "";
        header.append(kind, path);
        card.appendChild(header);
        const details = [];
        if (op.old_label !== undefined || op.new_label !== undefined)
            details.push(`label: ${op.old_label ?? "-"} -> ${op.new_label ?? "-"}`);
        if (op.old_value !== undefined || op.new_value !== undefined)
            details.push(`value: ${op.old_value ?? "-"} -> ${op.new_value ?? "-"}`);
        if (op.position !== undefined && op.position !== null)
            details.push(`position: ${op.position}`);
        const body = document.createElement("pre");
        body.className = "code-block";
        body.textContent = details.join("\n") || JSON.stringify(op, null, 2);
        card.appendChild(body);
        elements.operationsList.appendChild(card);
    });
}

function renderMetrics(result) {
    elements.distanceValue.textContent  = result.stats.distance;
    elements.similarityValue.textContent = result.stats.similarity;
    elements.patchValue.textContent     = result.patch.success ? "Valid" : "Mismatch";
    elements.opsValue.textContent       = result.summary.total_visible;
    elements.tree1Nodes.textContent     = result.stats.tree1_nodes;
    elements.tree2Nodes.textContent     = result.stats.tree2_nodes;
    elements.insertCount.textContent    = result.summary.insert;
    elements.deleteCount.textContent    = result.summary.delete;
    elements.updateCount.textContent    = result.summary.update;
}

function renderTrees(result) {
    ["tree1View", "tree2View", "patchedTreeView"].forEach(id =>
        (elements[id].innerHTML = "", elements[id].classList.remove("empty-state")));
    elements.tree1View.appendChild(renderTreeNode(result.trees.tree1));
    elements.tree2View.appendChild(renderTreeNode(result.trees.tree2));
    elements.patchedTreeView.appendChild(renderTreeNode(result.trees.patched));
}

function updateArtifactView() {
    if (!state.result) {
        elements.artifactView.textContent = "Run a comparison to inspect generated artifacts.";
        elements.artifactView.classList.add("empty-state");
        return;
    }
    const value = state.result.outputs[state.activeArtifact];
    elements.artifactView.textContent = value || "Artifact not available for this mode.";
    elements.artifactView.classList.remove("empty-state");
}

function renderResult(result) {
    state.result = result;
    renderMetrics(result);
    renderOperations(result.ops.visible);
    renderTrees(result);
    elements.reportView.textContent = result.outputs.report;
    elements.reportView.classList.remove("empty-state");
    elements.opsSubtitle.textContent = `${result.ops.visible.length} visible operations using ${result.method}.`;
    if (result.mode === "wiki") state.activeArtifact = "tree1_infobox";
    else if (!result.outputs[state.activeArtifact]) state.activeArtifact = "tree1_json";
    updateArtifactButtons();
    updateArtifactView();
}

function updateArtifactButtons() {
    document.querySelectorAll(".artifact-button").forEach(btn =>
        btn.classList.toggle("active", btn.dataset.artifact === state.activeArtifact));
}

function activateTab(tabName) {
    document.querySelectorAll("#comparisonSection .tab-button").forEach(btn =>
        btn.classList.toggle("active", btn.dataset.tab === tabName));
    document.querySelectorAll("#comparisonSection .tab-panel").forEach(panel =>
        panel.classList.toggle("active", panel.id === `${tabName}Tab`));
}

async function runComparison() {
    setStatus("Running", "loading");
    elements.compareButton.disabled = true;
    try {
        const response = await fetch("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode:   elements.modeSelect.value,
                method: elements.methodSelect.value,
                file1:  elements.file1Select.value,
                file2:  elements.file2Select.value,
            }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Comparison failed.");
        renderResult(payload);
        setStatus("Complete", "success");
        activateTab("overview");
    } catch (err) {
        setStatus("Error", "error");
        elements.reportView.textContent = err.message;
        elements.reportView.classList.remove("empty-state");
    } finally {
        elements.compareButton.disabled = false;
    }
}

async function initComparison() {
    setStatus("Loading", "loading");
    const r = await fetch("/api/options");
    state.options = await r.json();
    fillSelect(elements.modeSelect, Object.keys(state.options.modes));
    fillSelect(elements.methodSelect, state.options.methods);
    updateFileChoices();
    setStatus("Ready", "idle");
}

elements.modeSelect.addEventListener("change", updateFileChoices);
elements.file1Select.addEventListener("change", refreshPreviews);
elements.file2Select.addEventListener("change", refreshPreviews);
elements.compareButton.addEventListener("click", runComparison);
elements.swapButton.addEventListener("click", () => {
    const f = elements.file1Select.value;
    elements.file1Select.value = elements.file2Select.value;
    elements.file2Select.value = f;
    refreshPreviews();
});
document.querySelectorAll("#comparisonSection .tab-button").forEach(btn =>
    btn.addEventListener("click", () => activateTab(btn.dataset.tab)));
document.querySelectorAll(".artifact-button").forEach(btn =>
    btn.addEventListener("click", () => {
        state.activeArtifact = btn.dataset.artifact;
        updateArtifactButtons();
        updateArtifactView();
    }));


/* ═══════════════════════════════════════════════════════════════════════
   PROJECT 2  —  Clustering
   ═══════════════════════════════════════════════════════════════════════ */

const CLUSTER_COLORS = [
    "#35d0ba","#f4a340","#ff7a7a","#8ce5b5","#a78bfa",
    "#60a5fa","#fbbf24","#34d399","#f87171","#c084fc",
    "#fb923c","#38bdf8","#4ade80","#e879f9","#facc15",
    "#94a3b8","#f472b6","#a3e635","#e11d48","#0ea5e9",
];

function clusterColor(cid) {
    if (cid === -1) return "#555e6a";
    return CLUSTER_COLORS[cid % CLUSTER_COLORS.length];
}

/* ── State ────────────────────────────────────────────────────────────── */
const cState = {
    allCountries: [],
    selected: new Set(),
    result: null,
    activeTab: "scatter",
};

const liveState = {
    builtIn: [],
    live: [],
};

const liveElements = {
    section: document.getElementById("liveSection"),
    nameInput: document.getElementById("liveNameInput"),
    xmlInput: document.getElementById("liveXmlInput"),
    addButton: document.getElementById("liveAddButton"),
    methodSelect: document.getElementById("liveMethodSelect"),
    compareA: document.getElementById("liveCompareA"),
    compareB: document.getElementById("liveCompareB"),
    compareButton: document.getElementById("liveCompareButton"),
    clusterMethodSelect: document.getElementById("liveClusterMethodSelect"),
    clusterAlgorithm: document.getElementById("liveClusterAlgorithm"),
    clusterK: document.getElementById("liveClusterK"),
    clusterLinkage: document.getElementById("liveClusterLinkage"),
    clusterFiles: document.getElementById("liveClusterFiles"),
    clusterButton: document.getElementById("liveClusterButton"),
    statusPill: document.getElementById("liveStatusPill"),
    docsView: document.getElementById("liveDocsView"),
    compareSummary: document.getElementById("liveCompareSummary"),
    compareReport: document.getElementById("liveCompareReport"),
    clusterReport: document.getElementById("liveClusterReport"),
    matrixView: document.getElementById("liveMatrixView"),
};

/* ── Section switcher ─────────────────────────────────────────────────── */
document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const sec = btn.dataset.section;
        document.getElementById("comparisonSection").style.display  = sec === "comparison"  ? "" : "none";
        document.getElementById("clusteringSection").style.display  = sec === "clustering"  ? "" : "none";
        document.getElementById("liveSection").style.display        = sec === "live" ? "" : "none";
    });
});

/* ── Country list ─────────────────────────────────────────────────────── */
function prettyName(s) {
    return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function renderCountryList() {
    const query  = document.getElementById("countrySearch").value.toLowerCase();
    const list   = document.getElementById("countryList");
    list.innerHTML = "";
    cState.allCountries
        .filter(c => !query || c.includes(query) || prettyName(c).toLowerCase().includes(query))
        .forEach(c => {
            const item = document.createElement("label");
            item.className = "country-item";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.value = c;
            cb.checked = cState.selected.has(c);
            cb.addEventListener("change", () => {
                cb.checked ? cState.selected.add(c) : cState.selected.delete(c);
                updateSelectionBadge();
            });
            item.appendChild(cb);
            item.append(" " + prettyName(c));
            list.appendChild(item);
        });
}

function updateSelectionBadge() {
    document.getElementById("selectedCount").textContent = `${cState.selected.size} selected`;
}

function setLiveStatus(label, kind) {
    liveElements.statusPill.textContent = label;
    liveElements.statusPill.className = `status-pill ${kind}`;
}

async function readJsonResponse(response, fallbackMessage) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        const text = await response.text();
        const hint = text.includes("<!DOCTYPE") || text.includes("<html")
            ? "The UI server is likely still running the old code. Restart python src/ui_server.py and hard refresh the browser."
            : fallbackMessage;
        throw new Error(hint);
    }

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error || fallbackMessage);
    }
    return payload;
}

function liveFilesCombined() {
    return [...liveState.builtIn, ...liveState.live];
}

function renderLiveFileOptions() {
    const files = liveFilesCombined();
    fillSelect(liveElements.compareA, files);
    fillSelect(liveElements.compareB, files);
    fillSelect(liveElements.methodSelect, state.options?.methods || ["custom", "chawathe", "nj"]);
    fillSelect(liveElements.clusterMethodSelect, state.options?.methods || ["custom", "chawathe", "nj"]);
    if (files.length > 1) {
        liveElements.compareB.selectedIndex = 1;
    }

    liveElements.clusterFiles.innerHTML = "";
    files.forEach((file) => {
        const item = document.createElement("label");
        item.className = "country-item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = file;
        cb.checked = liveState.live.includes(file);
        item.appendChild(cb);
        item.append(" " + file.replace("data/normalized_xml/", "").replace("data/live_xml/", ""));
        liveElements.clusterFiles.appendChild(item);
    });

    const allLines = [
        `Built-in XML files: ${liveState.builtIn.length}`,
        `Live XML files: ${liveState.live.length}`,
        "",
        ...liveState.live,
    ];
    liveElements.docsView.textContent = allLines.join("\n");
    liveElements.docsView.classList.remove("empty-state");
}

async function refreshLiveFiles() {
    const r = await fetch("/api/live/files");
    const payload = await readJsonResponse(r, "Could not load live files.");
    liveState.builtIn = payload.built_in || [];
    liveState.live = payload.live || [];
    renderLiveFileOptions();
}

async function runLiveCompare() {
    setLiveStatus("Comparing", "loading");
    liveElements.compareButton.disabled = true;
    try {
        const r = await fetch("/api/live/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                method: liveElements.methodSelect.value,
                file1: liveElements.compareA.value,
                file2: liveElements.compareB.value,
            }),
        });
        const payload = await readJsonResponse(r, "Live comparison failed.");
        const summaryLines = [
            `Distance: ${payload.stats.distance}`,
            `Similarity: ${payload.stats.similarity}`,
            `Patch: ${payload.patch.success ? "Valid" : "Mismatch"}`,
            `Visible operations: ${payload.summary.total_visible}`,
            `Tree 1 nodes: ${payload.stats.tree1_nodes}`,
            `Tree 2 nodes: ${payload.stats.tree2_nodes}`,
            `Inserts: ${payload.summary.insert}`,
            `Deletes: ${payload.summary.delete}`,
            `Updates: ${payload.summary.update}`,
        ];
        liveElements.compareSummary.textContent = summaryLines.join("\n");
        liveElements.compareSummary.classList.remove("empty-state");
        liveElements.compareReport.textContent = payload.outputs.report;
        liveElements.compareReport.classList.remove("empty-state");
        setLiveStatus("Comparison Ready", "success");
    } catch (err) {
        liveElements.compareSummary.textContent = err.message;
        liveElements.compareSummary.classList.remove("empty-state");
        liveElements.compareReport.textContent = err.message;
        liveElements.compareReport.classList.remove("empty-state");
        setLiveStatus("Error", "error");
    } finally {
        liveElements.compareButton.disabled = false;
    }
}

async function saveLiveCountry() {
    const name = liveElements.nameInput.value.trim();
    const xml = liveElements.xmlInput.value.trim();
    if (!name || !xml) {
        setLiveStatus("Name and XML required", "error");
        return;
    }
    setLiveStatus("Saving", "loading");
    liveElements.addButton.disabled = true;
    try {
        const r = await fetch("/api/live/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, xml }),
        });
        await readJsonResponse(r, "Could not save live country.");
        liveElements.nameInput.value = "";
        liveElements.xmlInput.value = "";
        await refreshLiveFiles();
        setLiveStatus("Live country saved", "success");
    } catch (err) {
        setLiveStatus("Error", "error");
        liveElements.docsView.textContent = err.message;
        liveElements.docsView.classList.remove("empty-state");
    } finally {
        liveElements.addButton.disabled = false;
    }
}

function selectedLiveClusterFiles() {
    return [...liveElements.clusterFiles.querySelectorAll("input[type='checkbox']:checked")].map((cb) => cb.value);
}

function renderSimpleMatrix(container, labels, matrix) {
    container.innerHTML = "";
    if (!labels.length || !matrix.length) {
        container.textContent = "No matrix available.";
        container.classList.add("empty-state");
        return;
    }

    container.classList.remove("empty-state");
    const table = document.createElement("table");
    table.className = "matrix-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "Doc";
    headRow.appendChild(corner);
    labels.forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    let minD = Infinity;
    let maxD = -Infinity;
    for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < matrix.length; j++) {
            if (i === j) continue;
            minD = Math.min(minD, matrix[i][j]);
            maxD = Math.max(maxD, matrix[i][j]);
        }
    }
    const range = Math.max(maxD - minD, 1);

    const tbody = document.createElement("tbody");
    matrix.forEach((row, i) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = labels[i];
        tr.appendChild(th);
        row.forEach((value, j) => {
            const td = document.createElement("td");
            td.textContent = String(value);
            const t = i === j ? 0 : (value - minD) / range;
            td.style.background = i === j
                ? "rgba(26,46,66,0.85)"
                : `rgba(53, 208, 186, ${Math.max(0.06, 0.45 * (1 - t))})`;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
}

async function runLiveCluster() {
    const files = selectedLiveClusterFiles();
    if (files.length < 2) {
        setLiveStatus("Select at least 2 files", "error");
        return;
    }

    setLiveStatus("Clustering", "loading");
    liveElements.clusterButton.disabled = true;
    try {
        const algorithm = liveElements.clusterAlgorithm.value;
        const params = algorithm === "ahc"
            ? { n_clusters: Number(liveElements.clusterK.value), linkage: liveElements.clusterLinkage.value }
            : { k: Number(liveElements.clusterK.value) };

        const r = await fetch("/api/live/cluster", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                files,
                method: liveElements.clusterMethodSelect.value,
                algorithm,
                params,
            }),
        });
        const payload = await readJsonResponse(r, "Live clustering failed.");

        const lines = [
            `Algorithm: ${payload.algorithm}`,
            `Countries: ${payload.countries.length}`,
            `Silhouette: ${payload.metrics.silhouette ?? "N/A"}`,
            `Dunn index: ${payload.metrics.dunn ?? "N/A"}`,
            "",
            "Cluster members:",
            JSON.stringify(payload.cluster_members, null, 2),
        ];
        liveElements.clusterReport.textContent = lines.join("\n");
        liveElements.clusterReport.classList.remove("empty-state");
        renderSimpleMatrix(
            liveElements.matrixView,
            payload.countries.map((country) => prettyName(country)),
            payload.matrix || [],
        );
        setLiveStatus("Clustering Ready", "success");
    } catch (err) {
        liveElements.clusterReport.textContent = err.message;
        liveElements.clusterReport.classList.remove("empty-state");
        liveElements.matrixView.textContent = err.message;
        liveElements.matrixView.classList.remove("empty-state");
        setLiveStatus("Error", "error");
    } finally {
        liveElements.clusterButton.disabled = false;
    }
}

document.getElementById("countrySearch").addEventListener("input", renderCountryList);

document.getElementById("selectAllBtn").addEventListener("click", () => {
    const query = document.getElementById("countrySearch").value.toLowerCase();
    cState.allCountries
        .filter(c => !query || c.includes(query) || prettyName(c).toLowerCase().includes(query))
        .forEach(c => cState.selected.add(c));
    renderCountryList();
    updateSelectionBadge();
});

document.getElementById("clearAllBtn").addEventListener("click", () => {
    const query = document.getElementById("countrySearch").value.toLowerCase();
    if (!query) {
        cState.selected.clear();
    } else {
        cState.allCountries
            .filter(c => c.includes(query) || prettyName(c).toLowerCase().includes(query))
            .forEach(c => cState.selected.delete(c));
    }
    renderCountryList();
    updateSelectionBadge();
});

/* ── Algorithm param switcher ─────────────────────────────────────────── */
const algoParamDivs = {
    ahc:      document.getElementById("ahcParams"),
    kmedoids: document.getElementById("kmedoidsParams"),
    kmeans:   document.getElementById("kmeansParams"),
    dbscan:   document.getElementById("dbscanParams"),
};

document.getElementById("algorithmSelect").addEventListener("change", function () {
    Object.entries(algoParamDivs).forEach(([k, el]) =>
        el.style.display = (k === this.value) ? "" : "none");
});

/* ── Clustering tab switcher ──────────────────────────────────────────── */
function activateClusterTab(tabName) {
    cState.activeTab = tabName;
    document.querySelectorAll("#clusteringSection .tab-button").forEach(btn =>
        btn.classList.toggle("active", btn.dataset.ctab === tabName));
    document.querySelectorAll("#clusteringSection .tab-panel").forEach(panel =>
        panel.classList.toggle("active", panel.id === `${tabName}Tab`));
    if (cState.result) rerenderActiveTab();
}

document.querySelectorAll("#clusteringSection .tab-button").forEach(btn =>
    btn.addEventListener("click", () => activateClusterTab(btn.dataset.ctab)));

/* ── Run clustering ───────────────────────────────────────────────────── */
function setClusterStatus(label, kind) {
    const pill = document.getElementById("clusterStatusPill");
    pill.textContent = label;
    pill.className = `status-pill ${kind}`;
}

function gatherParams() {
    const alg = document.getElementById("algorithmSelect").value;
    if (alg === "ahc")      return { n_clusters: +document.getElementById("ahcK").value,    linkage: document.getElementById("linkageSelect").value };
    if (alg === "kmedoids") return { k: +document.getElementById("kmedK").value };
    if (alg === "kmeans")   return { k: +document.getElementById("kmeansK").value };
    if (alg === "dbscan")   return { eps: +document.getElementById("dbscanEps").value, min_samples: +document.getElementById("dbscanMin").value };
    return {};
}

document.getElementById("runClusterBtn").addEventListener("click", async () => {
    const countries = [...cState.selected];
    if (countries.length < 2) {
        setClusterStatus("Select >= 2 countries", "error");
        return;
    }
    const alg    = document.getElementById("algorithmSelect").value;
    const params = gatherParams();
    setClusterStatus("Running…", "loading");
    document.getElementById("runClusterBtn").disabled = true;
    try {
        const r = await fetch("/api/cluster/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ countries, algorithm: alg, params }),
        });
        const payload = await r.json();
        if (!r.ok) throw new Error(payload.error || "Clustering failed.");
        cState.result = payload;
        renderClusterResults(payload);
        setClusterStatus("Done", "success");
    } catch (err) {
        setClusterStatus("Error", "error");
        console.error(err);
        alert(err.message);
    } finally {
        document.getElementById("runClusterBtn").disabled = false;
    }
});

/* ── Render results ───────────────────────────────────────────────────── */
function renderClusterResults(result) {
    const n      = result.countries.length;
    const nCl    = result.n_clusters ?? Object.keys(result.cluster_members).length;
    const sil    = result.metrics.silhouette;
    const dunn   = result.metrics.dunn;
    const nNoise = (result.noise || []).length;

    document.getElementById("cMetricClusters").textContent  = nCl;
    document.getElementById("cMetricSilhouette").textContent = sil !== null ? sil.toFixed(4) : "N/A";
    document.getElementById("cMetricDunn").textContent       = dunn !== null ? dunn.toFixed(4) : "N/A";
    document.getElementById("cMetricCountries").textContent  = nNoise > 0 ? `${n} (${nNoise} noise)` : n;

    rerenderActiveTab();
}

function rerenderActiveTab() {
    const result = cState.result;
    if (!result) return;
    const tab = cState.activeTab;
    if (tab === "scatter")    renderScatter(result);
    if (tab === "heatmap")    renderHeatmap(result);
    if (tab === "clusters")   renderClusterTable(result);
    if (tab === "dendrogram") renderDendrogram(result);
}

/* ════════════════════════════════════════════════════════════════════════
   CANVAS RENDERERS
   ════════════════════════════════════════════════════════════════════════ */

/* ── Scatter (MDS 2-D) ────────────────────────────────────────────────── */
function renderScatter(result) {
    const canvas = document.getElementById("scatterCanvas");
    const ctx    = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = 60;
    ctx.clearRect(0, 0, W, H);

    const coords  = result.coords_2d;
    const assigns = result.assignments;
    const countries = result.countries;
    if (!coords || !coords.length) return;

    const xs = coords.map(c => c[0]), ys = coords.map(c => c[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;

    function toCanvas(x, y) {
        return [
            pad + ((x - xMin) / xRange) * (W - 2 * pad),
            H - pad - ((y - yMin) / yRange) * (H - 2 * pad),
        ];
    }

    // draw points
    const n = countries.length;
    const r = n <= 20 ? 7 : n <= 50 ? 5 : 4;
    ctx.font = `${n <= 30 ? 11 : 9}px var(--body-font, sans-serif)`;

    countries.forEach((c, i) => {
        const cid  = assigns[c] ?? -1;
        const [cx, cy] = toCanvas(coords[i][0], coords[i][1]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = clusterColor(cid);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        if (n <= 40) {
            ctx.fillStyle = "rgba(237,244,248,0.88)";
            ctx.fillText(prettyName(c), cx + r + 3, cy + 4);
        }
    });

    // legend
    const members = result.cluster_members || {};
    const clusterIds = Object.keys(members).map(Number).sort((a, b) => a - b);
    const legendX = W - 155, legendY = 18;
    ctx.font = "11px var(--body-font, sans-serif)";
    clusterIds.slice(0, 14).forEach((cid, idx) => {
        const ly = legendY + idx * 18;
        ctx.beginPath();
        ctx.arc(legendX + 8, ly + 5, 5, 0, Math.PI * 2);
        ctx.fillStyle = clusterColor(cid);
        ctx.fill();
        const label = cid === -1 ? "Noise" : `Cluster ${cid} (${(members[cid] || []).length})`;
        ctx.fillStyle = "rgba(237,244,248,0.8)";
        ctx.fillText(label, legendX + 18, ly + 9);
    });
    if (clusterIds.length > 14) {
        ctx.fillStyle = "rgba(157,180,196,0.7)";
        ctx.fillText(`+ ${clusterIds.length - 14} more…`, legendX + 18, legendY + 14 * 18 + 9);
    }

    document.getElementById("scatterNote").textContent =
        `${result.algorithm?.toUpperCase()} · ${result.countries.length} countries · ${result.n_clusters ?? "?"} clusters`;
}

/* ── Heatmap ──────────────────────────────────────────────────────────── */
function heatmapColor(t) {
    // t ∈ [0,1]: blue(0) → white(0.5) → red(1)
    const r = Math.round(255 * Math.min(1, t * 2));
    const g = Math.round(255 * (1 - Math.abs(t - 0.5) * 1.8));
    const b = Math.round(255 * Math.max(0, 1 - t * 2));
    return `rgb(${r},${Math.max(0,g)},${b})`;
}

function renderHeatmap(result) {
    const canvas  = document.getElementById("heatmapCanvas");
    const matrix  = result.matrix;
    const labels  = result.countries;
    const assigns = result.assignments;
    const n = labels.length;
    if (!n) return;

    const labelW  = n <= 30 ? 110 : n <= 60 ? 70 : 0;
    const cellSz  = n <= 15 ? 36 : n <= 30 ? 24 : n <= 60 ? 14 : n <= 100 ? 8 : n <= 150 ? 5 : 3;
    const gridSz  = n * cellSz;
    const W = gridSz + labelW + 20;
    const H = gridSz + labelW + 20;

    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#07131f";
    ctx.fillRect(0, 0, W, H);

    // compute min/max excluding diagonal
    let minD = Infinity, maxD = -Infinity;
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            if (i !== j) { minD = Math.min(minD, matrix[i][j]); maxD = Math.max(maxD, matrix[i][j]); }
    const range = maxD - minD || 1;

    const ox = labelW, oy = labelW;

    // cells
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) {
                ctx.fillStyle = "#1a2e42";
            } else {
                const t = (matrix[i][j] - minD) / range;
                ctx.fillStyle = heatmapColor(t);
            }
            ctx.fillRect(ox + j * cellSz, oy + i * cellSz, cellSz - 0.5, cellSz - 0.5);
        }
    }

    // cluster border outlines (if cells big enough)
    if (cellSz >= 8) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.5;
        const cids = labels.map(c => assigns[c] ?? -1);
        // horizontal lines between different clusters
        for (let i = 1; i < n; i++) {
            if (cids[i] !== cids[i-1]) {
                ctx.beginPath();
                ctx.moveTo(ox, oy + i * cellSz);
                ctx.lineTo(ox + gridSz, oy + i * cellSz);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(ox + i * cellSz, oy);
                ctx.lineTo(ox + i * cellSz, oy + gridSz);
                ctx.stroke();
            }
        }
    }

    // axis labels
    if (labelW > 0) {
        ctx.font = `${cellSz >= 20 ? 11 : 9}px var(--mono-font, monospace)`;
        ctx.fillStyle = "rgba(237,244,248,0.8)";
        labels.forEach((c, i) => {
            const lbl = prettyName(c).substring(0, cellSz >= 20 ? 18 : 12);
            // row label
            ctx.textAlign = "right";
            ctx.fillText(lbl, ox - 4, oy + i * cellSz + cellSz / 2 + 4);
            // col label
            ctx.save();
            ctx.translate(ox + i * cellSz + cellSz / 2, oy - 4);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = "left";
            ctx.fillText(lbl, 0, 0);
            ctx.restore();
        });
    }
}

/* ── Cluster table ────────────────────────────────────────────────────── */
function renderClusterTable(result) {
    const wrap = document.getElementById("clusterTableWrap");
    wrap.innerHTML = "";

    const members  = result.cluster_members || {};
    const assigns  = result.assignments     || {};
    const noise    = result.noise           || [];
    const medoids  = result.medoids         || [];

    // sort cluster ids numerically
    const clusterIds = Object.keys(members).map(Number).sort((a, b) => a - b);

    clusterIds.forEach(cid => {
        const section = document.createElement("div");
        section.className = "cluster-section";

        const hdr = document.createElement("div");
        hdr.className = "cluster-section-header";
        const dot = document.createElement("span");
        dot.className = "cluster-dot";
        dot.style.background = clusterColor(cid);
        const title = document.createElement("span");
        title.textContent = `Cluster ${cid}  —  ${(members[cid] || []).length} countries`;
        hdr.append(dot, title);
        section.appendChild(hdr);

        const grid = document.createElement("div");
        grid.className = "cluster-country-grid";
        (members[cid] || []).sort().forEach(c => {
            const chip = document.createElement("span");
            chip.className = "country-chip";
            if (medoids.includes(c)) chip.classList.add("medoid");
            chip.textContent = prettyName(c);
            chip.title = medoids.includes(c) ? "Medoid" : "";
            grid.appendChild(chip);
        });
        section.appendChild(grid);
        wrap.appendChild(section);
    });

    if (noise.length > 0) {
        const section = document.createElement("div");
        section.className = "cluster-section";
        const hdr = document.createElement("div");
        hdr.className = "cluster-section-header";
        const dot = document.createElement("span");
        dot.className = "cluster-dot";
        dot.style.background = clusterColor(-1);
        hdr.append(dot, document.createTextNode(`Noise  —  ${noise.length} countries`));
        section.appendChild(hdr);
        const grid = document.createElement("div");
        grid.className = "cluster-country-grid";
        noise.sort().forEach(c => {
            const chip = document.createElement("span");
            chip.className = "country-chip noise-chip";
            chip.textContent = prettyName(c);
            grid.appendChild(chip);
        });
        section.appendChild(grid);
        wrap.appendChild(section);
    }
}

/* ── Dendrogram ───────────────────────────────────────────────────────── */
function renderDendrogram(result) {
    const canvas   = document.getElementById("dendrogramCanvas");
    const linkage  = result.linkage_matrix;
    const labels   = result.countries;
    const assigns  = result.assignments || {};
    const n = labels ? labels.length : 0;

    if (!linkage || !linkage.length || !n) {
        const ctx = canvas.getContext("2d");
        canvas.width = 600; canvas.height = 120;
        ctx.clearRect(0, 0, 600, 120);
        ctx.fillStyle = "rgba(157,180,196,0.6)";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Dendrogram is only available for AHC.", 300, 60);
        return;
    }

    // ── leaf ordering via DFS ──
    const children = {};
    linkage.forEach(([a, b], i) => { children[n + i] = [a, b]; });

    function dfsOrder(nodeId) {
        if (nodeId < n) return [nodeId];
        const [l, r] = children[nodeId] || [nodeId, nodeId];
        return [...dfsOrder(l), ...dfsOrder(r)];
    }

    const leafOrder = dfsOrder(n + linkage.length - 1);
    const leafPos   = {};
    leafOrder.forEach((id, i) => { leafPos[id] = i; });

    // ── compute x / y positions for every node ──
    const xPos = { ...leafPos };
    const yPos = {};
    leafOrder.forEach(id => { yPos[id] = 0; });

    const allDists = linkage.map(row => row[2]);
    const maxDist  = Math.max(...allDists);

    linkage.forEach(([a, b, dist], i) => {
        const nid = n + i;
        xPos[nid] = (xPos[a] + xPos[b]) / 2;
        yPos[nid] = dist;
    });

    // ── canvas size ──
    const leafH   = n <= 50 ? 20 : n <= 100 ? 12 : 8;
    const labelW  = n <= 60 ? 130 : n <= 100 ? 80 : 0;
    const topPad  = 30;
    const rightPad = 30;
    const dendH   = n * leafH;         // vertical space for leaves
    const dendW   = 700;               // horizontal space for tree

    canvas.height = dendH + topPad + 10;
    canvas.width  = dendW + labelW + rightPad;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#07131f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // convert logical → pixel
    function px(nodeId) {
        const x = topPad + (yPos[nodeId] / maxDist) * dendW;
        const y = (xPos[nodeId] + 0.5) * leafH;
        return [x, y];
    }

    // draw merges
    ctx.lineWidth = 1.4;
    linkage.forEach(([a, b, dist], i) => {
        const nid   = n + i;
        const [nx, ny] = px(nid);
        const [ax, ay] = px(a);
        const [bx, by] = px(b);

        const cid = assigns[labels[leafOrder[xPos[a]]]] ?? -1;
        ctx.strokeStyle = clusterColor(cid) + "cc";

        // horizontal to child a
        ctx.beginPath(); ctx.moveTo(nx, ay); ctx.lineTo(ax, ay); ctx.stroke();
        // horizontal to child b
        ctx.beginPath(); ctx.moveTo(nx, by); ctx.lineTo(bx, by); ctx.stroke();
        // vertical connector
        ctx.beginPath(); ctx.moveTo(nx, ay); ctx.lineTo(nx, by); ctx.stroke();
    });

    // leaf labels
    if (labelW > 0) {
        ctx.font = `${leafH >= 16 ? 11 : 9}px var(--mono-font, monospace)`;
        ctx.textAlign = "left";
        leafOrder.forEach(id => {
            const [lx, ly] = px(id);
            const cid = assigns[labels[id]] ?? -1;
            ctx.fillStyle = clusterColor(cid);
            ctx.fillText(prettyName(labels[id]).substring(0, 20), 4, ly + 4);
        });
    }

    // x-axis ticks (distance scale)
    ctx.strokeStyle = "rgba(157,180,196,0.3)";
    ctx.fillStyle   = "rgba(157,180,196,0.6)";
    ctx.font        = "10px sans-serif";
    ctx.textAlign   = "center";
    ctx.lineWidth   = 0.8;
    for (let t = 0; t <= 4; t++) {
        const d  = (t / 4) * maxDist;
        const tx = topPad + (t / 4) * dendW;
        ctx.beginPath();
        ctx.moveTo(tx, 0);
        ctx.lineTo(tx, dendH + topPad);
        ctx.stroke();
        ctx.fillText(Math.round(d), tx, 12);
    }
}

/* ── Init clustering ──────────────────────────────────────────────────── */
async function initClustering() {
    try {
        const r = await fetch("/api/cluster/countries");
        const data = await r.json();
        cState.allCountries = data.countries || [];
        cState.selected = new Set(cState.allCountries);
        renderCountryList();
        updateSelectionBadge();
    } catch (e) {
        console.error("Could not load cluster countries:", e);
    }
}

async function initLiveLab() {
    try {
        setLiveStatus("Loading", "loading");
        await refreshLiveFiles();
        setLiveStatus("Ready", "idle");
    } catch (e) {
        console.error("Could not load live lab:", e);
        setLiveStatus("Error", "error");
        liveElements.docsView.textContent = e.message;
        liveElements.docsView.classList.remove("empty-state");
    }
}


/* ═══════════════════════════════════════════════════════════════════════
   BOOTSTRAP
   ═══════════════════════════════════════════════════════════════════════ */
initComparison();
initClustering();
initLiveLab();

liveElements.addButton.addEventListener("click", saveLiveCountry);
liveElements.compareButton.addEventListener("click", runLiveCompare);
liveElements.clusterButton.addEventListener("click", runLiveCluster);
