import assert from 'node:assert/strict';
import { computeRegionalGeology, LITHOLOGY_CLASSES, METAL_PROVINCES } from '../js/geology.js';

const width = 12;
const height = 8;
const n = width * height;
const neighbors = Array.from({ length: n }, () => []);
const index = (x, y) => y * width + ((x % width) + width) % width;

for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const r = index(x, y);
        neighbors[r].push(index(x - 1, y), index(x + 1, y));
        if (y > 0) neighbors[r].push(index(x, y - 1));
        if (y < height - 1) neighbors[r].push(index(x, y + 1));
    }
}

const adjOffset = new Int32Array(n + 1);
const flatNeighbors = [];
for (let r = 0; r < n; r++) {
    adjOffset[r] = flatNeighbors.length;
    flatNeighbors.push(...neighbors[r]);
}
adjOffset[n] = flatNeighbors.length;
const mesh = { numRegions: n, adjOffset, adjList: Int32Array.from(flatNeighbors) };

const r_xyz = new Float32Array(n * 3);
const r_elevation = new Float32Array(n);
const debugLayers = {};
for (const key of [
    'cratonWeight', 'foldBeltWeight', 'basinWeight', 'tecActivity', 'orogenicPower',
    'margins', 'hotspot', 'lip', 'backArc', 'mantleFlow', 'erosionDelta',
]) debugLayers[key] = new Float32Array(n);

const r_stress = new Float32Array(n);
const r_precip_summer = new Float32Array(n);
const r_precip_winter = new Float32Array(n);
const r_flow_receiver = new Int32Array(n);
const r_river_strength = new Float32Array(n);
r_flow_receiver.fill(-1);

for (let y = 0; y < height; y++) {
    const lat = Math.PI * (0.5 - (y + 0.5) / height);
    for (let x = 0; x < width; x++) {
        const r = index(x, y);
        const lon = Math.PI * (2 * (x + 0.5) / width - 1);
        r_xyz[r * 3] = Math.cos(lat) * Math.sin(lon);
        r_xyz[r * 3 + 1] = Math.sin(lat);
        r_xyz[r * 3 + 2] = Math.cos(lat) * Math.cos(lon);

        const isLand = y >= 2 && y <= 5;
        r_elevation[r] = isLand ? 0.18 + 0.05 * Math.sin(x) : -0.32;
        debugLayers.cratonWeight[r] = isLand && x < 4 ? 0.9 : 0.08;
        debugLayers.foldBeltWeight[r] = isLand && x >= 4 && x < 8 ? 0.85 : 0.10;
        debugLayers.basinWeight[r] = isLand && x >= 8 ? 0.88 : 0.08;
        debugLayers.tecActivity[r] = isLand && x >= 4 && x < 8 ? 0.78 : 0.15;
        debugLayers.orogenicPower[r] = debugLayers.foldBeltWeight[r] - 0.5;
        debugLayers.margins[r] = !isLand && x === 6 ? 1 : (isLand && x === 7 ? 0.8 : 0.2);
        debugLayers.hotspot[r] = isLand && x === 2 ? 0.8 : 0;
        debugLayers.lip[r] = isLand && x === 3 ? 0.7 : 0;
        debugLayers.backArc[r] = isLand && x === 7 ? 0.6 : 0;
        debugLayers.mantleFlow[r] = 0.2 + x / width;
        debugLayers.erosionDelta[r] = isLand ? (x < 8 ? -0.02 : 0.015) : 0;
        r_stress[r] = debugLayers.foldBeltWeight[r];
        r_precip_summer[r] = isLand ? 0.35 + 0.04 * y : 0;
        r_precip_winter[r] = isLand ? 0.55 - 0.03 * y : 0;
        if (isLand) {
            r_flow_receiver[r] = y === 2 ? -1 : index(x, y - 1);
            if (x === 5) r_river_strength[r] = 0.8;
        }
    }
}

const options = {
    seed: 12345,
    debugLayers,
    r_stress,
    r_precip_summer,
    r_precip_winter,
    r_flow_receiver,
    r_river_strength,
};
const first = computeRegionalGeology(mesh, r_xyz, r_elevation, options);
const second = computeRegionalGeology(mesh, r_xyz, r_elevation, options);

assert(first, 'geology result should exist when tectonic inputs are available');
assert.equal(first.r_surface_lithology.length, n);
assert.equal(first.r_metal_province.length, n);
assert.deepEqual(first.r_surface_lithology, second.r_surface_lithology, 'same seed must be deterministic');
assert.deepEqual(first.r_metal_province, second.r_metal_province, 'metal provinces must be deterministic');

for (let r = 0; r < n; r++) {
    assert(first.r_surface_lithology[r] < LITHOLOGY_CLASSES.length);
    assert(first.r_metal_province[r] < METAL_PROVINCES.length);
    assert(Number.isFinite(first.r_basement_age_ma[r]));
    assert(first.r_basement_age_ma[r] >= 0 && first.r_basement_age_ma[r] <= 3800);
    for (const key of ['r_metal_arc', 'r_metal_orogenic', 'r_metal_vms', 'r_metal_mafic', 'r_metal_craton', 'r_metal_sedimentary', 'r_metal_placer']) {
        assert(first[key][r] >= 0 && first[key][r] <= 1, `${key} out of range at ${r}`);
    }
}

assert(new Set(first.r_surface_lithology).size >= 4, 'synthetic world should produce several lithologies');
assert(Math.max(...first.r_metal_arc) > 0.35, 'arc setting should produce a visible signal');
assert(Math.max(...first.r_metal_craton) > 0.35, 'craton setting should produce a visible signal');
assert(METAL_PROVINCES[1].metals.includes('copper'), 'arc metadata should list copper');
assert(METAL_PROVINCES[4].metals.includes('iron'), 'mafic metadata should list iron');
assert(METAL_PROVINCES[6].metals.includes('aluminum'), 'residual metadata should list aluminum');

console.log('Geology smoke test passed', {
    lithologies: new Set(first.r_surface_lithology).size,
    metalProvinces: new Set(first.r_metal_province).size,
    maxArc: Math.max(...first.r_metal_arc).toFixed(3),
    maxPlacer: Math.max(...first.r_metal_placer).toFixed(3),
});

