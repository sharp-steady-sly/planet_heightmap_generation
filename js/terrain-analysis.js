// Regional terrain analysis derived from the physical elevation field.
// Values describe broad world-map terrain over tens to hundreds of kilometres;
// they are not substitutes for local surveying or town-scale topography.

import { elevToHeightKm, elevationToColor } from './color-map.js';

const EARTH_RADIUS_KM = 6371;
const RELIEF_TARGET_RADIUS_KM = 200;
const MAX_MAJOR_PEAKS = 50;
const PEAK_SEPARATION_KM = 250;

export const ELEVATION_BANDS = Object.freeze([
    Object.freeze({ max: 100,  name: '0-100 m',       color: [0.12, 0.42, 0.24] }),
    Object.freeze({ max: 250,  name: '100-250 m',     color: [0.28, 0.56, 0.28] }),
    Object.freeze({ max: 500,  name: '250-500 m',     color: [0.52, 0.66, 0.30] }),
    Object.freeze({ max: 1000, name: '500-1,000 m',   color: [0.72, 0.70, 0.34] }),
    Object.freeze({ max: 1500, name: '1,000-1,500 m', color: [0.78, 0.58, 0.31] }),
    Object.freeze({ max: 2000, name: '1,500-2,000 m', color: [0.76, 0.45, 0.27] }),
    Object.freeze({ max: 3000, name: '2,000-3,000 m', color: [0.68, 0.34, 0.24] }),
    Object.freeze({ max: 4000, name: '3,000-4,000 m', color: [0.57, 0.28, 0.25] }),
    Object.freeze({ max: 5000, name: '4,000-5,000 m', color: [0.56, 0.54, 0.52] }),
    Object.freeze({ max: Infinity, name: '5,000-6,000 m', color: [0.91, 0.93, 0.94] }),
]);

export const TERRAIN_CLASSES = Object.freeze([
    Object.freeze({ code: 'ocean', name: 'Ocean' }),
    Object.freeze({ code: 'plain', name: 'Plain' }),
    Object.freeze({ code: 'rolling', name: 'Rolling terrain' }),
    Object.freeze({ code: 'hills', name: 'Hills' }),
    Object.freeze({ code: 'low_mountains', name: 'Low mountains' }),
    Object.freeze({ code: 'high_mountains', name: 'High mountains' }),
    Object.freeze({ code: 'alpine_massif', name: 'Major alpine massif' }),
    Object.freeze({ code: 'plateau', name: 'Elevated plateau' }),
]);

export const SLOPE_LEGEND = Object.freeze([
    Object.freeze({ name: 'Flat: 0-5 m/km', color: [0.16, 0.48, 0.28] }),
    Object.freeze({ name: 'Rolling: 5-15', color: [0.53, 0.68, 0.29] }),
    Object.freeze({ name: 'Hilly: 15-30', color: [0.91, 0.68, 0.20] }),
    Object.freeze({ name: 'Steep: 30-60', color: [0.84, 0.32, 0.16] }),
    Object.freeze({ name: 'Severe: 60+', color: [0.38, 0.08, 0.18] }),
]);

export const RELIEF_LEGEND = Object.freeze([
    Object.freeze({ name: 'Plain: <100 m', color: [0.22, 0.56, 0.43] }),
    Object.freeze({ name: 'Rolling: 100-300', color: [0.55, 0.70, 0.32] }),
    Object.freeze({ name: 'Hills: 300-750', color: [0.90, 0.70, 0.22] }),
    Object.freeze({ name: 'Low mountains: 750-1,500', color: [0.87, 0.39, 0.17] }),
    Object.freeze({ name: 'High mountains: 1,500-2,500', color: [0.64, 0.16, 0.24] }),
    Object.freeze({ name: 'Alpine massif: 2,500+', color: [0.37, 0.16, 0.48] }),
]);

function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function blend(a, b, t) {
    const s = clamp01(t);
    return [
        a[0] + (b[0] - a[0]) * s,
        a[1] + (b[1] - a[1]) * s,
        a[2] + (b[2] - a[2]) * s,
    ];
}

function rampColor(value, stops) {
    if (!Number.isFinite(value)) value = 0;
    if (value <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
        if (value <= stops[i][0]) {
            const [x0, c0] = stops[i - 1];
            const [x1, c1] = stops[i];
            return blend(c0, c1, (value - x0) / (x1 - x0));
        }
    }
    return stops[stops.length - 1][1];
}

export function elevationBandColor(elevation) {
    if (elevation <= 0) return elevationToColor(elevation);
    const metres = elevToHeightKm(elevation) * 1000;
    return (ELEVATION_BANDS.find(band => metres < band.max) || ELEVATION_BANDS[ELEVATION_BANDS.length - 1]).color;
}

export function regionalSlopeColor(value, elevation) {
    if (elevation <= 0) return elevationToColor(elevation).map(v => v * 0.72);
    return rampColor(value, [
        [0, SLOPE_LEGEND[0].color],
        [5, SLOPE_LEGEND[1].color],
        [15, SLOPE_LEGEND[2].color],
        [30, SLOPE_LEGEND[3].color],
        [60, SLOPE_LEGEND[4].color],
        [100, [0.18, 0.04, 0.12]],
    ]);
}

export function localReliefColor(value, elevation) {
    if (elevation <= 0) return elevationToColor(elevation).map(v => v * 0.72);
    return rampColor(value, [
        [0, RELIEF_LEGEND[0].color],
        [100, RELIEF_LEGEND[1].color],
        [300, RELIEF_LEGEND[2].color],
        [750, RELIEF_LEGEND[3].color],
        [1500, RELIEF_LEGEND[4].color],
        [2500, RELIEF_LEGEND[5].color],
        [4000, [0.18, 0.08, 0.28]],
    ]);
}

export function topographicColor(elevation, hillshade, contourClass, peakRank) {
    const base = elevationBandColor(elevation);
    if (elevation <= 0) return base;
    const shade = 0.72 + clamp01(hillshade) * 0.42;
    let color = base.map(v => Math.min(1, v * shade));
    if (contourClass === 1) color = color.map(v => v * 0.70);
    if (contourClass === 2) color = color.map(v => v * 0.48);
    if (peakRank > 0 && peakRank <= 20) {
        color = peakRank === 1 ? [0.16, 0.02, 0.04] : [0.20, 0.12, 0.10];
    }
    return color;
}

export function majorPeaksColor(peakRank, elevation) {
    const base = elevationBandColor(elevation);
    if (elevation <= 0) return base.map(v => v * 0.58);
    if (peakRank === 1) return [0.92, 0.08, 0.10];
    if (peakRank <= 5 && peakRank > 0) return [0.98, 0.42, 0.08];
    if (peakRank <= 20 && peakRank > 0) return [0.98, 0.82, 0.12];
    if (peakRank <= 50 && peakRank > 0) return [0.64, 0.28, 0.76];
    const gray = 0.25 + 0.45 * clamp01(elevToHeightKm(elevation) / 6);
    return blend([gray, gray, gray], base, 0.30);
}

function terrainClassId(elevationM, reliefM, slopeMPerKm) {
    if (elevationM <= 0) return 0;
    if (elevationM >= 1000 && reliefM < 500 && slopeMPerKm < 25) return 7;
    if (reliefM < 100) return 1;
    if (reliefM < 300) return 2;
    if (reliefM < 750) return 3;
    if (reliefM < 1500) return 4;
    if (reliefM < 2500) return 5;
    return 6;
}

function elevationBandId(elevationM) {
    const index = ELEVATION_BANDS.findIndex(band => elevationM < band.max);
    return index >= 0 ? index : ELEVATION_BANDS.length - 1;
}

function slopeClassId(value) {
    if (value < 5) return 0;
    if (value < 15) return 1;
    if (value < 30) return 2;
    if (value < 60) return 3;
    return 4;
}

function reliefClassId(value) {
    if (value < 100) return 0;
    if (value < 300) return 1;
    if (value < 750) return 2;
    if (value < 1500) return 3;
    if (value < 2500) return 4;
    return 5;
}

export function computeTerrainAnalysis(mesh, r_xyz, r_elevation, neighborDist = null) {
    const n = mesh.numRegions;
    const { adjOffset, adjList } = mesh;
    const elevationM = new Float32Array(n);
    const slope = new Float32Array(n);
    const hillshade = new Float32Array(n);
    const contourClass = new Uint8Array(n);
    const terrainClass = new Uint8Array(n);
    const elevationBand = new Uint8Array(n);
    const slopeClass = new Uint8Array(n);
    const reliefClass = new Uint8Array(n);
    const peakRank = new Uint16Array(n);
    const peakMarkerRank = new Uint16Array(n);
    const peakGroup = new Uint8Array(n);
    const peakProminence = new Float32Array(n);

    elevationBand.fill(255);
    slopeClass.fill(255);
    reliefClass.fill(255);
    peakGroup.fill(255);

    for (let r = 0; r < n; r++) elevationM[r] = elevToHeightKm(r_elevation[r]) * 1000;

    const lightEast = -0.5;
    const lightNorth = 0.5;
    const lightUp = Math.SQRT1_2;

    for (let r = 0; r < n; r++) {
        if (elevationM[r] <= 0) {
            hillshade[r] = 0.72;
            continue;
        }
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        let ex = z, ez = -x;
        const eLen = Math.hypot(ex, ez) || 1;
        ex /= eLen; ez /= eLen;
        const nx = y * ez;
        const ny = z * ex - x * ez;
        const nz = -y * ex;

        let xx = 0, xy = 0, yy = 0, xh = 0, yh = 0;
        for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
            const nb = adjList[i];
            const vx = r_xyz[3 * nb] - x;
            const vy = r_xyz[3 * nb + 1] - y;
            const vz = r_xyz[3 * nb + 2] - z;
            let dx = (vx * ex + vz * ez) * EARTH_RADIUS_KM;
            let dy = (vx * nx + vy * ny + vz * nz) * EARTH_RADIUS_KM;
            if (neighborDist) {
                const chord = neighborDist[i];
                const arcKm = 2 * Math.asin(Math.min(1, Math.max(0, chord) * 0.5)) * EARTH_RADIUS_KM;
                const tangentKm = Math.hypot(dx, dy);
                if (tangentKm > 1e-9) {
                    const scale = arcKm / tangentKm;
                    dx *= scale;
                    dy *= scale;
                }
            }
            const nbHeightM = Math.max(0, elevationM[nb]);
            const dhKm = (nbHeightM - elevationM[r]) / 1000;
            xx += dx * dx; xy += dx * dy; yy += dy * dy;
            xh += dx * dhKm; yh += dy * dhKm;
        }
        const determinant = xx * yy - xy * xy;
        let gx = 0, gy = 0;
        if (Math.abs(determinant) > 1e-12) {
            gx = (xh * yy - yh * xy) / determinant;
            gy = (yh * xx - xh * xy) / determinant;
        }
        slope[r] = Math.hypot(gx, gy) * 1000;
        const normalLength = Math.hypot(gx, gy, 1) || 1;
        const illumination = (-gx * lightEast - gy * lightNorth + lightUp) / normalLength;
        hillshade[r] = 0.20 + 0.80 * Math.max(0, illumination);
    }

    const nominalCellKm = Math.sqrt(4 * Math.PI * EARTH_RADIUS_KM * EARTH_RADIUS_KM / Math.max(1, n));
    const reliefRings = Math.max(2, Math.min(6, Math.round(RELIEF_TARGET_RADIUS_KM / nominalCellKm)));
    let minA = new Float32Array(n);
    let maxA = new Float32Array(n);
    let minB = new Float32Array(n);
    let maxB = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        minA[r] = elevationM[r] > 0 ? elevationM[r] : Infinity;
        maxA[r] = elevationM[r] > 0 ? elevationM[r] : -Infinity;
    }
    for (let pass = 0; pass < reliefRings; pass++) {
        for (let r = 0; r < n; r++) {
            if (elevationM[r] <= 0) { minB[r] = Infinity; maxB[r] = -Infinity; continue; }
            let mn = minA[r], mx = maxA[r];
            for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
                const nb = adjList[i];
                if (minA[nb] < mn) mn = minA[nb];
                if (maxA[nb] > mx) mx = maxA[nb];
            }
            minB[r] = mn; maxB[r] = mx;
        }
        [minA, minB] = [minB, minA];
        [maxA, maxB] = [maxB, maxA];
    }
    const localRelief = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        if (elevationM[r] > 0 && Number.isFinite(minA[r]) && Number.isFinite(maxA[r])) {
            localRelief[r] = Math.max(0, maxA[r] - minA[r]);
        }
        terrainClass[r] = terrainClassId(elevationM[r], localRelief[r], slope[r]);
        if (elevationM[r] > 0) {
            elevationBand[r] = elevationBandId(elevationM[r]);
            slopeClass[r] = slopeClassId(slope[r]);
            reliefClass[r] = reliefClassId(localRelief[r]);
        }
    }

    let landRegionCount = 0;
    const terrainBandStats = ELEVATION_BANDS.map((band, id) => ({
        id,
        name: band.name,
        regionCount: 0,
        percentOfLand: 0,
        plateauRegionCount: 0,
        plateauPercent: 0,
        meanReliefM: 0,
        meanSlopeMPerKm: 0,
    }));
    for (let r = 0; r < n; r++) {
        if (elevationM[r] <= 0) continue;
        landRegionCount++;
        const stat = terrainBandStats[elevationBand[r]];
        stat.regionCount++;
        stat.meanReliefM += localRelief[r];
        stat.meanSlopeMPerKm += slope[r];
        if (terrainClass[r] === 7) stat.plateauRegionCount++;
    }
    for (const stat of terrainBandStats) {
        stat.percentOfLand = landRegionCount > 0 ? 100 * stat.regionCount / landRegionCount : 0;
        stat.plateauPercent = stat.regionCount > 0 ? 100 * stat.plateauRegionCount / stat.regionCount : 0;
        if (stat.regionCount > 0) {
            stat.meanReliefM /= stat.regionCount;
            stat.meanSlopeMPerKm /= stat.regionCount;
        }
    }

    // Mark cells that straddle 500 m contours; kilometre contours are stronger.
    for (let r = 0; r < n; r++) {
        if (elevationM[r] <= 0) continue;
        let contour = 0;
        for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
            const nb = adjList[i];
            if (elevationM[nb] <= 0) continue;
            const lo = Math.min(elevationM[r], elevationM[nb]);
            const hi = Math.max(elevationM[r], elevationM[nb]);
            const first = Math.ceil((lo + 0.01) / 500) * 500;
            for (let level = first; level <= hi; level += 500) {
                contour = Math.max(contour, level % 1000 === 0 ? 2 : 1);
                if (contour === 2) break;
            }
            if (contour === 2) break;
        }
        contourClass[r] = contour;
    }

    const candidates = [];
    for (let r = 0; r < n; r++) {
        if (elevationM[r] < 500) continue;
        let isMaximum = true;
        for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
            const nb = adjList[i];
            if (r_elevation[nb] > r_elevation[r] + 1e-7 ||
                (Math.abs(r_elevation[nb] - r_elevation[r]) <= 1e-7 && nb < r)) {
                isMaximum = false;
                break;
            }
        }
        if (isMaximum) candidates.push(r);
    }
    candidates.sort((a, b) => (elevationM[b] - elevationM[a]) || (r_elevation[b] - r_elevation[a]));

    const selected = [];
    for (const r of candidates) {
        let separated = true;
        for (const other of selected) {
            const dot = Math.max(-1, Math.min(1,
                r_xyz[3 * r] * r_xyz[3 * other] +
                r_xyz[3 * r + 1] * r_xyz[3 * other + 1] +
                r_xyz[3 * r + 2] * r_xyz[3 * other + 2]));
            if (Math.acos(dot) * EARTH_RADIUS_KM < PEAK_SEPARATION_KM) {
                separated = false;
                break;
            }
        }
        if (!separated) continue;
        selected.push(r);
        if (selected.length >= MAX_MAJOR_PEAKS) break;
    }

    const majorPeaks = selected.map((r, index) => {
        const rank = index + 1;
        peakRank[r] = rank;
        peakProminence[r] = Math.max(0, elevationM[r] - minA[r]);
        const y = r_xyz[3 * r + 1];
        return {
            rank,
            region: r,
            elevationM: Math.round(elevationM[r]),
            modelElevationRaw: r_elevation[r],
            prominenceProxyM: Math.round(peakProminence[r]),
            latitudeDeg: Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI,
            longitudeDeg: Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]) * 180 / Math.PI,
        };
    });

    // Widen summit symbols just enough to remain visible on dense world meshes.
    // r_peak_rank stays exact; this companion field is display-only.
    const peakMarkerRings = Math.max(1, Math.min(3, Math.round(80 / nominalCellKm)));
    const visited = new Int32Array(n);
    let visitToken = 0;
    for (let rankIndex = 0; rankIndex < selected.length; rankIndex++) {
        const rank = rankIndex + 1;
        const start = selected[rankIndex];
        visitToken++;
        let frontier = [start];
        visited[start] = visitToken;
        for (let ring = 0; ring <= peakMarkerRings; ring++) {
            const next = [];
            for (const r of frontier) {
                if (peakMarkerRank[r] === 0) peakMarkerRank[r] = rank;
                if (ring === peakMarkerRings) continue;
                for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
                    const nb = adjList[i];
                    if (visited[nb] === visitToken) continue;
                    visited[nb] = visitToken;
                    next.push(nb);
                }
            }
            frontier = next;
        }
    }
    for (let r = 0; r < n; r++) {
        const rank = peakMarkerRank[r];
        if (rank === 1) peakGroup[r] = 0;
        else if (rank <= 5 && rank > 0) peakGroup[r] = 1;
        else if (rank <= 20 && rank > 0) peakGroup[r] = 2;
        else if (rank <= 50 && rank > 0) peakGroup[r] = 3;
    }

    const reliefRadiusKm = reliefRings * nominalCellKm;
    return {
        r_elevation_m: elevationM,
        r_regional_slope_m_per_km: slope,
        r_local_relief_m: localRelief,
        r_hillshade: hillshade,
        r_contour_class: contourClass,
        r_terrain_class: terrainClass,
        r_elevation_band: elevationBand,
        r_slope_class: slopeClass,
        r_relief_class: reliefClass,
        r_peak_rank: peakRank,
        r_peak_marker_rank: peakMarkerRank,
        r_peak_group: peakGroup,
        r_peak_prominence_m: peakProminence,
        majorPeaks,
        terrainReliefRadiusKm: reliefRadiusKm,
        terrainBandStats,
        debugLayers: {
            topographicRelief: elevationM,
            elevationBands: elevationM,
            regionalSlope: slope,
            localRelief,
            majorPeaks: peakMarkerRank,
        },
    };
}
