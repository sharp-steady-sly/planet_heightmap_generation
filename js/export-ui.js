// Shared export modal behavior for generated and imported worlds.

import { state } from './state.js';
import { exportMap, exportMapBatch } from './planet-mesh.js';
import { getExportLayers, getExportLayerDefinition, exportLayerHasData } from './export-layers.js';
import { exportWorldData } from './world-data-export.js';

export function initExportUI({ showBuildOverlay, hideBuildOverlay, onProgress, computeClimateViaWorker }) {
    const overlay = document.getElementById('exportOverlay');
    const closeBtn = document.getElementById('exportClose');
    const cancelBtn = document.getElementById('exportCancel');
    const goBtn = document.getElementById('exportGo');
    const atlasBtn = document.getElementById('exportWorldbuildingGo');
    const allBtn = document.getElementById('exportAllGo');
    const dataBtn = document.getElementById('exportDataGo');
    const widthEl = document.getElementById('exportWidth');
    const dimsEl = document.getElementById('exportDims');
    const typeEl = document.getElementById('exportType');
    const openBtn = document.getElementById('exportBtn');

    function updateDims() {
        const width = +widthEl.value;
        dimsEl.textContent = `${width} × ${width / 2}`;
    }

    function populateTypes() {
        const previous = typeEl.value || 'color';
        const groups = new Map();
        for (const def of getExportLayers({ imported: state.importedHeightmap })) {
            if (!groups.has(def.category)) groups.set(def.category, []);
            groups.get(def.category).push(def);
        }

        typeEl.replaceChildren();
        for (const [category, definitions] of groups) {
            const group = document.createElement('optgroup');
            group.label = category;
            for (const def of definitions) {
                const option = document.createElement('option');
                option.value = def.id;
                option.textContent = def.label;
                group.appendChild(option);
            }
            typeEl.appendChild(group);
        }
        const hasPrevious = Array.from(typeEl.options).some(option => option.value === previous);
        typeEl.value = hasPrevious ? previous : 'color';
    }

    function openModal() {
        populateTypes();
        updateDims();
        overlay.classList.remove('hidden');
    }

    function closeModal() {
        overlay.classList.add('hidden');
    }

    async function ensureClimate(definitions) {
        if (!definitions.some(def => def.requiresClimate) || state.climateComputed) return;
        onProgress(0, 'Computing climate...');
        await new Promise(resolve => computeClimateViaWorker(onProgress, resolve));
        if (!state.climateComputed) throw new Error('Climate calculation did not complete.');
    }

    async function runExport(work) {
        closeModal();
        showBuildOverlay();
        try {
            await work();
        } catch (error) {
            console.error('[World Orogen] Export failed', error);
            alert(`Export failed: ${error.message || error}`);
        } finally {
            hideBuildOverlay();
        }
    }

    function available(definitions) {
        return definitions.filter(def => exportLayerHasData(def, state.curData));
    }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
    });
    widthEl.addEventListener('change', updateDims);

    goBtn.addEventListener('click', () => runExport(async () => {
        const def = getExportLayerDefinition(typeEl.value);
        if (!def) throw new Error('Choose a map type to export.');
        await ensureClimate([def]);
        onProgress(0, `Preparing ${def.label}...`);
        await exportMap(def.id, +widthEl.value, onProgress);
    }));

    atlasBtn.addEventListener('click', () => runExport(async () => {
        const definitions = getExportLayers({ preset: 'worldbuilding', imported: state.importedHeightmap });
        await ensureClimate(definitions);
        const layers = available(definitions).map(def => ({ type: def.id, label: def.label }));
        await exportMapBatch(layers, +widthEl.value, onProgress);
    }));

    allBtn.addEventListener('click', () => runExport(async () => {
        const definitions = getExportLayers({ preset: 'all', imported: state.importedHeightmap });
        await ensureClimate(definitions);
        const layers = available(definitions).map(def => ({ type: def.id, label: def.label }));
        await exportMapBatch(layers, +widthEl.value, onProgress);
    }));

    dataBtn.addEventListener('click', () => runExport(async () => {
        await ensureClimate(getExportLayers({ preset: 'worldbuilding', imported: state.importedHeightmap }));
        onProgress(0, 'Preparing world data...');
        await exportWorldData(onProgress);
    }));
}
