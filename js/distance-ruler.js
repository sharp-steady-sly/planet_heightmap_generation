import * as THREE from 'three';
import { canvas, camera, mapCamera, ctrl, mapCtrl, scene } from './scene.js';
import { state } from './state.js';
import { getHitInfo } from './edit-mode.js';
import {
    formatArea,
    formatDistance,
    greatCircleDistanceKm,
    projectGreatCircleToMap,
    sampleGreatCircle,
    sphericalPolygonAreaKm2,
} from './distance-utils.js';

const STORAGE_PREFIX = 'wo-distance-ruler:';
const LINE_COLOR = '#ffd34d';
const AREA_COLOR = '#5de2e7';
const OUTLINE_COLOR = '#080b14';

let overlay;
let measureButton;
let undoButton;
let clearButton;
let exportButton;
let unitSelect;
let widthSelect;
let statusElement;
let lineModeButton;
let areaModeButton;
let finishAreaButton;
let draftStart = null;
let draftArea = [];
let measurements = [];
let areas = [];
let storageKey = '';
let pointerDown = null;

function currentWorldKey() {
    const hash = location.hash.replace(/^#/, '').trim();
    return STORAGE_PREFIX + (hash || (state.importedHeightmap ? 'imported-heightmap' : 'unsaved-world'));
}

function validDirection(value) {
    return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function loadMeasurements() {
    storageKey = currentWorldKey();
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const savedMeasurements = Array.isArray(saved) ? saved : saved.measurements;
        const savedAreas = Array.isArray(saved) ? [] : saved.areas;
        measurements = Array.isArray(savedMeasurements)
            ? savedMeasurements.filter(item => validDirection(item.a) && validDirection(item.b)).map(item => ({
                a: item.a.slice(0, 3),
                b: item.b.slice(0, 3),
                distanceKm: greatCircleDistanceKm(item.a, item.b),
            }))
            : [];
        areas = Array.isArray(savedAreas)
            ? savedAreas.filter(item => Array.isArray(item.vertices)
                && item.vertices.length >= 3 && item.vertices.every(validDirection)).map(item => ({
                vertices: item.vertices.map(vertex => vertex.slice(0, 3)),
                areaKm2: sphericalPolygonAreaKm2(item.vertices),
            }))
            : [];
    } catch (_) {
        measurements = [];
        areas = [];
    }
    draftStart = null;
    draftArea = [];
    updateControls();
}

function saveMeasurements() {
    try {
        localStorage.setItem(storageKey || currentWorldKey(), JSON.stringify({
            measurements: measurements.map(({ a, b }) => ({ a, b })),
            areas: areas.map(({ vertices }) => ({ vertices })),
        }));
    } catch (_) {}
}

function setMode(enabled) {
    state.rulerMode = !!enabled;
    draftStart = null;
    draftArea = [];
    canvas.classList.toggle('ruler-active', state.rulerMode);
    measureButton?.classList.toggle('active', state.rulerMode);
    measureButton?.setAttribute('aria-pressed', String(state.rulerMode));
    syncDistanceRulerView();
    updateControls();
}

function setTool(tool) {
    state.rulerTool = tool === 'area' ? 'area' : 'line';
    draftStart = null;
    draftArea = [];
    localStorage.setItem('wo-ruler-tool', state.rulerTool);
    updateControls();
}

function updateControls() {
    const hasDraft = !!draftStart || draftArea.length > 0;
    const hasSaved = measurements.length > 0 || areas.length > 0;
    if (undoButton) undoButton.disabled = !hasSaved && !hasDraft;
    if (clearButton) clearButton.disabled = !hasSaved && !hasDraft;
    if (exportButton) exportButton.disabled = !hasSaved;
    lineModeButton?.classList.toggle('active', state.rulerTool === 'line');
    areaModeButton?.classList.toggle('active', state.rulerTool === 'area');
    lineModeButton?.setAttribute('aria-pressed', String(state.rulerTool === 'line'));
    areaModeButton?.setAttribute('aria-pressed', String(state.rulerTool === 'area'));
    if (finishAreaButton) {
        finishAreaButton.hidden = state.rulerTool !== 'area' || draftArea.length === 0;
        finishAreaButton.disabled = draftArea.length < 3;
    }
    if (!statusElement) return;
    const total = measurements.length + areas.length;
    const countText = `${total} pinned`;
    if (draftStart) statusElement.textContent = `${countText} · Select the endpoint`;
    else if (draftArea.length > 0) {
        const areaText = draftArea.length >= 3
            ? ` · ${formatArea(sphericalPolygonAreaKm2(draftArea), state.rulerUnits).join(' / ')} · Finish when ready`
            : ' · Add at least 3 points';
        statusElement.textContent = `${draftArea.length} area points${areaText}`;
    } else if (state.rulerMode && state.rulerTool === 'area') statusElement.textContent = `${countText} · Select the first boundary point`;
    else if (state.rulerMode) statusElement.textContent = `${countText} · Select the starting point`;
    else statusElement.textContent = total === 1 ? '1 pinned measurement' : `${total} pinned measurements`;
}

function addPoint(direction) {
    if (state.rulerTool === 'area') {
        const last = draftArea.at(-1);
        if (!last || greatCircleDistanceKm(last, direction) > 0.01) draftArea.push(direction.slice(0, 3));
        updateControls();
        return;
    }
    if (!draftStart) {
        draftStart = direction.slice(0, 3);
    } else {
        const distanceKm = greatCircleDistanceKm(draftStart, direction);
        if (distanceKm > 0.01) {
            measurements.push({ a: draftStart, b: direction.slice(0, 3), distanceKm });
            saveMeasurements();
        }
        draftStart = null;
    }
    updateControls();
}

function finishArea() {
    if (draftArea.length < 3) return;
    const vertices = draftArea.map(vertex => vertex.slice(0, 3));
    areas.push({ vertices, areaKm2: sphericalPolygonAreaKm2(vertices) });
    draftArea = [];
    saveMeasurements();
    updateControls();
}

function screenPointFromNdc(vector, width, height) {
    return { x: (vector.x + 1) * width * 0.5, y: (1 - vector.y) * height * 0.5 };
}

function mapScreenPaths(measurement, width, height) {
    return projectGreatCircleToMap(measurement.a, measurement.b, state.mapCenterLon || 0).map(segment =>
        segment.map(point => screenPointFromNdc(
            new THREE.Vector3(point.x, point.y, 0).project(mapCamera), width, height,
        )),
    );
}

function globeScreenPaths(measurement, width, height) {
    if (!state.planetMesh) return [];
    state.planetMesh.updateMatrixWorld(true);
    const rotation = new THREE.Quaternion();
    state.planetMesh.getWorldQuaternion(rotation);
    const center = new THREE.Vector3().setFromMatrixPosition(state.planetMesh.matrixWorld);
    const paths = [];
    let current = [];

    for (const direction of sampleGreatCircle(measurement.a, measurement.b)) {
        const local = new THREE.Vector3(direction[0], direction[1], direction[2]);
        const normal = local.clone().applyQuaternion(rotation);
        const world = local.multiplyScalar(1.105).applyMatrix4(state.planetMesh.matrixWorld);
        const visible = normal.dot(camera.position.clone().sub(center).sub(normal.clone().multiplyScalar(1.105))) > 0;
        if (!visible) {
            if (current.length > 1) paths.push(current);
            current = [];
            continue;
        }
        const ndc = world.project(camera);
        if (ndc.z < -1 || ndc.z > 1) continue;
        current.push(screenPointFromNdc(ndc, width, height));
    }
    if (current.length > 1) paths.push(current);
    return paths;
}

function screenPointForDirection(direction, width, height) {
    if (state.mapMode) {
        const point = projectGreatCircleToMap(direction, direction, state.mapCenterLon || 0, 2)[0]?.[0];
        return point ? screenPointFromNdc(
            new THREE.Vector3(point.x, point.y, 0).project(mapCamera), width, height,
        ) : null;
    }
    return globeScreenPaths({ a: direction, b: direction }, width, height)[0]?.[0] || null;
}

function pathMarkup(points, className, close = false) {
    if (points.length < 2) return '';
    const d = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
        + (close ? ' Z' : '');
    return `<path class="${className}" d="${d}"/>`;
}

function longestPath(paths) {
    return paths.reduce((best, path) => path.length > best.length ? path : best, []);
}

function measurementMarkup(measurement, index, width, height) {
    const paths = state.mapMode
        ? mapScreenPaths(measurement, width, height)
        : globeScreenPaths(measurement, width, height);
    if (paths.length === 0) return '';

    let markup = '';
    for (const path of paths) {
        markup += pathMarkup(path, 'ruler-line-outline');
        markup += pathMarkup(path, 'ruler-line');
    }

    const firstPath = paths[0];
    const lastPath = paths[paths.length - 1];
    const endpoints = [firstPath[0], lastPath[lastPath.length - 1]];
    for (const point of endpoints) {
        markup += `<line class="ruler-tick-outline" x1="${point.x}" y1="${point.y - 8}" x2="${point.x}" y2="${point.y + 8}"/>`;
        markup += `<line class="ruler-tick" x1="${point.x}" y1="${point.y - 8}" x2="${point.x}" y2="${point.y + 8}"/>`;
    }

    const labelPath = longestPath(paths);
    const anchor = labelPath[Math.floor(labelPath.length / 2)];
    if (!anchor) return markup;
    const lines = formatDistance(measurement.distanceKm, state.rulerUnits);
    const y = anchor.y - (lines.length > 1 ? 13 : 5);
    markup += `<text class="ruler-label" x="${anchor.x}" y="${y}" data-measurement="${index}">`;
    lines.forEach((line, lineIndex) => {
        markup += `<tspan x="${anchor.x}" dy="${lineIndex === 0 ? 0 : 16}">${line}</tspan>`;
    });
    markup += '</text>';
    return markup;
}

function sphericalCentroid(vertices) {
    const sum = vertices.reduce((result, vertex) => [
        result[0] + vertex[0], result[1] + vertex[1], result[2] + vertex[2],
    ], [0, 0, 0]);
    const length = Math.hypot(...sum);
    return length > 1e-8 ? sum.map(value => value / length) : vertices[0];
}

function areaMarkup(area, index, width, height, draft = false) {
    const vertices = area.vertices;
    if (vertices.length === 0) return '';
    const closed = vertices.length >= 3;
    const edgeCount = closed ? vertices.length : vertices.length - 1;
    const edges = [];
    for (let i = 0; i < edgeCount; i++) {
        const edge = { a: vertices[i], b: vertices[(i + 1) % vertices.length] };
        edges.push(state.mapMode ? mapScreenPaths(edge, width, height) : globeScreenPaths(edge, width, height));
    }

    let markup = '';
    const fullyVisible = closed && edges.every(paths => paths.length === 1
        && (state.mapMode || paths[0].length >= 90));
    if (fullyVisible) {
        const boundary = edges.flatMap((paths, edgeIndex) => edgeIndex ? paths[0].slice(1) : paths[0]);
        markup += pathMarkup(boundary, 'ruler-area-fill', true);
    }
    for (const paths of edges) {
        for (const path of paths) {
            markup += pathMarkup(path, 'ruler-area-outline');
            markup += pathMarkup(path, 'ruler-area-line');
        }
    }
    for (const vertex of vertices) {
        const point = screenPointForDirection(vertex, width, height);
        if (point) markup += `<circle class="ruler-area-point" cx="${point.x}" cy="${point.y}" r="5"/>`;
    }
    if (!closed) return markup;

    const anchor = screenPointForDirection(sphericalCentroid(vertices), width, height)
        || longestPath(edges.flat())[0];
    if (!anchor) return markup;
    const areaKm2 = draft ? sphericalPolygonAreaKm2(vertices) : area.areaKm2;
    const lines = formatArea(areaKm2, state.rulerUnits);
    const y = anchor.y - (lines.length > 1 ? 13 : 5);
    markup += `<text class="ruler-area-label" x="${anchor.x}" y="${y}" data-area="${index}">`;
    lines.forEach((line, lineIndex) => {
        markup += `<tspan x="${anchor.x}" dy="${lineIndex === 0 ? 0 : 17}">${line}</tspan>`;
    });
    markup += '</text>';
    return markup;
}

function draftMarkup(width, height) {
    if (!draftStart) return '';
    let point = null;
    if (state.mapMode) {
        const segment = projectGreatCircleToMap(draftStart, draftStart, state.mapCenterLon || 0, 2)[0];
        if (segment?.[0]) point = screenPointFromNdc(
            new THREE.Vector3(segment[0].x, segment[0].y, 0).project(mapCamera), width, height,
        );
    } else if (state.planetMesh) {
        const paths = globeScreenPaths({ a: draftStart, b: draftStart }, width, height);
        point = paths[0]?.[0] || null;
    }
    return point ? `<circle class="ruler-start" cx="${point.x}" cy="${point.y}" r="5"/>` : '';
}

export function updateDistanceRulerOverlay() {
    if (!overlay) return;
    if (measurements.length === 0 && areas.length === 0 && !draftStart && draftArea.length === 0) {
        if (overlay.childNodes.length > 0) overlay.innerHTML = '';
        return;
    }
    const width = innerWidth;
    const height = innerHeight;
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    overlay.innerHTML = measurements.map((measurement, index) =>
        measurementMarkup(measurement, index, width, height),
    ).join('') + areas.map((area, index) => areaMarkup(area, index, width, height)).join('')
        + draftMarkup(width, height)
        + (draftArea.length ? areaMarkup({ vertices: draftArea }, 'draft', width, height, true) : '');
}

export function syncDistanceRulerView() {
    ctrl.enabled = !state.mapMode && !state.rulerMode;
    mapCtrl.enabled = state.mapMode && !state.rulerMode;
}

function exportOverlay() {
    if (measurements.length === 0 && areas.length === 0) return;
    const width = Number(widthSelect?.value) || 8192;
    const height = width / 2;
    const scale = width / 4096;
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const context = output.getContext('2d');
    context.lineCap = 'butt';
    context.lineJoin = 'round';

    const exportPoint = point => ({
        x: (point.x + 2) * width / 4,
        y: (1 - point.y) * height / 2,
    });
    const drawSegment = segment => {
        context.beginPath();
        segment.map(exportPoint).forEach((point, index) => {
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
        });
    };
    const drawLabel = (lines, anchorX, anchorY) => {
        const fontSize = 15 * scale;
        context.setLineDash([]);
        context.font = `600 ${fontSize}px "Segoe UI", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineWidth = 5 * scale;
        lines.forEach((line, lineIndex) => {
            const y = anchorY + (lineIndex - (lines.length - 1) / 2) * fontSize * 1.2;
            context.strokeStyle = OUTLINE_COLOR;
            context.strokeText(line, anchorX, y);
            context.fillStyle = '#ffffff';
            context.fillText(line, anchorX, y);
        });
    };

    for (const area of areas) {
        const edges = area.vertices.map((vertex, index) =>
            projectGreatCircleToMap(vertex, area.vertices[(index + 1) % area.vertices.length], 0, 192));
        if (edges.every(paths => paths.length === 1)) {
            const boundary = edges.flatMap((paths, index) => index ? paths[0].slice(1) : paths[0]);
            drawSegment(boundary);
            context.closePath();
            context.fillStyle = 'rgba(44, 196, 202, 0.18)';
            context.fill();
        }
        context.setLineDash([10 * scale, 7 * scale]);
        for (const paths of edges) {
            for (const segment of paths) {
                drawSegment(segment);
                context.strokeStyle = OUTLINE_COLOR;
                context.lineWidth = 6 * scale;
                context.stroke();
                drawSegment(segment);
                context.strokeStyle = AREA_COLOR;
                context.lineWidth = 2.5 * scale;
                context.stroke();
            }
        }
        context.setLineDash([]);
        for (const vertex of area.vertices) {
            const projected = projectGreatCircleToMap(vertex, vertex, 0, 2)[0]?.[0];
            if (!projected) continue;
            const point = exportPoint(projected);
            context.beginPath();
            context.arc(point.x, point.y, 5 * scale, 0, Math.PI * 2);
            context.fillStyle = AREA_COLOR;
            context.fill();
            context.strokeStyle = OUTLINE_COLOR;
            context.lineWidth = 3 * scale;
            context.stroke();
        }
        const centroid = sphericalCentroid(area.vertices);
        const projected = projectGreatCircleToMap(centroid, centroid, 0, 2)[0]?.[0];
        if (projected) {
            const anchor = exportPoint(projected);
            drawLabel(formatArea(area.areaKm2, state.rulerUnits), anchor.x, anchor.y);
        }
    }

    for (const measurement of measurements) {
        const segments = projectGreatCircleToMap(measurement.a, measurement.b, 0, 192);
        for (const segment of segments) {
            context.setLineDash([12 * scale, 8 * scale]);
            context.strokeStyle = OUTLINE_COLOR;
            context.lineWidth = 6 * scale;
            drawSegment(segment);
            context.stroke();
            context.strokeStyle = LINE_COLOR;
            context.lineWidth = 2.5 * scale;
            drawSegment(segment);
            context.stroke();
        }

        const endpointPoints = [segments[0]?.[0], segments[segments.length - 1]?.at(-1)].filter(Boolean);
        context.setLineDash([]);
        for (const point of endpointPoints) {
            const x = (point.x + 2) * width / 4;
            const y = (1 - point.y) * height / 2;
            context.beginPath();
            context.moveTo(x, y - 9 * scale);
            context.lineTo(x, y + 9 * scale);
            context.strokeStyle = OUTLINE_COLOR;
            context.lineWidth = 6 * scale;
            context.stroke();
            context.strokeStyle = LINE_COLOR;
            context.lineWidth = 2.5 * scale;
            context.stroke();
        }

        const flat = segments.flat();
        const anchorPoint = flat[Math.floor(flat.length / 2)];
        if (!anchorPoint) continue;
        const anchorX = (anchorPoint.x + 2) * width / 4;
        const anchorY = (1 - anchorPoint.y) * height / 2;
        const lines = formatDistance(measurement.distanceKm, state.rulerUnits);
        drawLabel(lines, anchorX, anchorY);
    }

    output.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const code = location.hash.replace(/^#/, '').trim() || 'world';
        anchor.href = url;
        anchor.download = `orogen-measurements-${code}.png`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        output.width = 0;
        output.height = 0;
    }, 'image/png');
}

export function setupDistanceRuler() {
    overlay = document.getElementById('distanceRulerOverlay');
    measureButton = document.getElementById('rulerToggle');
    undoButton = document.getElementById('rulerUndo');
    clearButton = document.getElementById('rulerClear');
    exportButton = document.getElementById('rulerExport');
    unitSelect = document.getElementById('rulerUnits');
    widthSelect = document.getElementById('rulerExportWidth');
    statusElement = document.getElementById('rulerStatus');
    lineModeButton = document.getElementById('rulerLineMode');
    areaModeButton = document.getElementById('rulerAreaMode');
    finishAreaButton = document.getElementById('rulerFinishArea');
    if (!overlay || !measureButton) return;

    state.rulerUnits = localStorage.getItem('wo-ruler-units') || 'both';
    state.rulerTool = localStorage.getItem('wo-ruler-tool') === 'area' ? 'area' : 'line';
    unitSelect.value = state.rulerUnits;
    loadMeasurements();

    measureButton.addEventListener('click', () => setMode(!state.rulerMode));
    lineModeButton?.addEventListener('click', () => setTool('line'));
    areaModeButton?.addEventListener('click', () => setTool('area'));
    finishAreaButton?.addEventListener('click', finishArea);
    unitSelect.addEventListener('change', () => {
        state.rulerUnits = unitSelect.value;
        localStorage.setItem('wo-ruler-units', state.rulerUnits);
        updateControls();
    });
    undoButton.addEventListener('click', () => {
        if (state.rulerTool === 'area') {
            if (draftArea.length) draftArea.pop();
            else areas.pop();
        } else if (draftStart) draftStart = null;
        else measurements.pop();
        saveMeasurements();
        updateControls();
    });
    clearButton.addEventListener('click', () => {
        draftStart = null;
        draftArea = [];
        measurements = [];
        areas = [];
        saveMeasurements();
        updateControls();
    });
    exportButton.addEventListener('click', exportOverlay);

    canvas.addEventListener('pointerdown', event => {
        if (!state.rulerMode || event.button !== 0 || !state.curData) return;
        const hit = getHitInfo(event);
        if (!hit?.direction) return;
        pointerDown = { x: event.clientX, y: event.clientY, direction: hit.direction };
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    canvas.addEventListener('pointerup', event => {
        if (!state.rulerMode || event.button !== 0) return;
        if (pointerDown) {
            const dx = event.clientX - pointerDown.x;
            const dy = event.clientY - pointerDown.y;
            if (dx * dx + dy * dy < 36) addPoint(pointerDown.direction);
        }
        pointerDown = null;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    document.addEventListener('keydown', event => {
        if (!state.rulerMode) return;
        if (event.key === 'Enter' && state.rulerTool === 'area' && draftArea.length >= 3) {
            finishArea();
            event.preventDefault();
            return;
        }
        if (event.key !== 'Escape') return;
        if (draftStart || draftArea.length) {
            draftStart = null;
            draftArea = [];
            updateControls();
        } else {
            setMode(false);
        }
    });

    document.getElementById('generate')?.addEventListener('generate-done', () => {
        const nextKey = currentWorldKey();
        if (nextKey !== storageKey) loadMeasurements();
    });
    updateControls();
}
