import assert from 'node:assert/strict';
import {
    computeTerrainAnalysis, elevationBandColor, regionalSlopeColor,
    localReliefColor, topographicColor, majorPeaksColor,
} from '../js/terrain-analysis.js';

const width = 7;
const height = 7;
const n = width * height;
const index = (x, y) => y * width + x;
const neighbors = Array.from({ length: n }, () => []);

for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const r = index(x, y);
        if (x > 0) neighbors[r].push(index(x - 1, y));
        if (x < width - 1) neighbors[r].push(index(x + 1, y));
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

for (let y = 0; y < height; y++) {
    const lat = (y - 3) * Math.PI / 180;
    for (let x = 0; x < width; x++) {
        const r = index(x, y);
        const lon = (x - 3) * Math.PI / 180;
        r_xyz[3 * r] = Math.cos(lat) * Math.sin(lon);
        r_xyz[3 * r + 1] = Math.sin(lat);
        r_xyz[3 * r + 2] = Math.cos(lat) * Math.cos(lon);
        const distance = Math.hypot(x - 3, y - 3);
        r_elevation[r] = distance > 3.25 ? -0.05 : Math.max(0.08, 0.95 - distance * 0.18);
    }
}

const result = computeTerrainAnalysis(mesh, r_xyz, r_elevation);
const summit = index(3, 3);

assert.equal(result.r_elevation_m.length, n);
assert.equal(result.r_regional_slope_m_per_km.length, n);
assert.equal(result.r_local_relief_m.length, n);
assert.equal(result.r_terrain_class.length, n);
assert.equal(result.r_elevation_band.length, n);
assert.equal(result.r_slope_class.length, n);
assert.equal(result.r_relief_class.length, n);
assert(result.r_elevation_m[summit] > 5000, 'central summit should exceed 5,000 m');
assert(result.r_local_relief_m[summit] > 0, 'summit should have measurable local relief');
assert.equal(result.r_peak_rank[summit], 1, 'central summit should be the highest ranked peak');
assert.equal(result.r_peak_marker_rank[summit], 1, 'summit marker should include the exact summit');
assert.equal(result.majorPeaks[0].region, summit);
assert(result.terrainReliefRadiusKm > 0);
assert.equal(result.terrainBandStats.length, 10);
assert(result.terrainBandStats.reduce((sum, stat) => sum + stat.regionCount, 0) > 0);

for (const color of [
    elevationBandColor(r_elevation[summit]),
    regionalSlopeColor(result.r_regional_slope_m_per_km[summit], r_elevation[summit]),
    localReliefColor(result.r_local_relief_m[summit], r_elevation[summit]),
    topographicColor(r_elevation[summit], result.r_hillshade[summit], result.r_contour_class[summit], 1),
    majorPeaksColor(1, r_elevation[summit]),
]) {
    assert.equal(color.length, 3);
    assert(color.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
}

console.log(`terrain-analysis smoke: ${n} regions, ${result.majorPeaks.length} peaks, radius ${result.terrainReliefRadiusKm.toFixed(0)} km`);
