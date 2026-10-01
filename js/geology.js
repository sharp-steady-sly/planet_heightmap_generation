// Deterministic regional geology and metallogenic favorability model.
//
// These layers infer broad geologic provinces from the terrain generator's
// tectonic diagnostics. They are useful for worldbuilding and regional-scale
// exploration, but they do not model stratigraphic sections, ore grades, or
// individual deposits.

import { SimplexNoise } from './simplex-noise.js';
import { elevToHeightKm } from './color-map.js';

const EARTH_RADIUS_KM = 6371;

export const LITHOLOGY_CLASSES = Object.freeze([
    Object.freeze({ code: 'marine_sediment', name: 'Marine sediment', color: [0.52, 0.62, 0.70] }),
    Object.freeze({ code: 'basalt', name: 'Basalt', color: [0.16, 0.20, 0.23] }),
    Object.freeze({ code: 'mafic_complex', name: 'Mafic / ultramafic complex', color: [0.20, 0.34, 0.25] }),
    Object.freeze({ code: 'granite_gneiss', name: 'Granite / gneiss', color: [0.74, 0.51, 0.49] }),
    Object.freeze({ code: 'arc_volcanic', name: 'Arc volcanic rock', color: [0.47, 0.33, 0.30] }),
    Object.freeze({ code: 'metamorphic', name: 'Metamorphic belt', color: [0.42, 0.31, 0.53] }),
    Object.freeze({ code: 'sandstone', name: 'Sandstone', color: [0.78, 0.58, 0.31] }),
    Object.freeze({ code: 'shale', name: 'Shale / mudstone', color: [0.34, 0.38, 0.40] }),
    Object.freeze({ code: 'carbonate', name: 'Carbonate platform', color: [0.80, 0.79, 0.65] }),
    Object.freeze({ code: 'evaporite', name: 'Evaporite basin', color: [0.91, 0.79, 0.60] }),
    Object.freeze({ code: 'flood_basalt', name: 'Flood basalt', color: [0.28, 0.20, 0.17] }),
    Object.freeze({ code: 'plutonic', name: 'Exposed plutonic rock', color: [0.83, 0.63, 0.61] }),
    Object.freeze({ code: 'unconsolidated', name: 'Unconsolidated sediment', color: [0.76, 0.72, 0.56] }),
]);

export const INTRUSIVE_TYPES = Object.freeze([
    Object.freeze({ code: 'none', name: 'None', color: [0.17, 0.18, 0.19], metals: Object.freeze([]) }),
    Object.freeze({
        code: 'felsic_batholith', name: 'Felsic batholith', color: [0.94, 0.58, 0.63],
        metals: Object.freeze(['tin', 'tungsten', 'molybdenum', 'lithium']),
    }),
    Object.freeze({
        code: 'arc_porphyry', name: 'Arc / porphyry system', color: [0.95, 0.37, 0.18],
        metals: Object.freeze(['copper', 'gold', 'silver', 'molybdenum']),
    }),
    Object.freeze({
        code: 'mafic_ultramafic', name: 'Mafic / ultramafic intrusion', color: [0.20, 0.58, 0.39],
        metals: Object.freeze(['iron', 'nickel', 'cobalt', 'chromium', 'vanadium', 'platinum']),
    }),
    Object.freeze({
        code: 'alkaline', name: 'Alkaline / hotspot intrusion', color: [0.77, 0.46, 0.87],
        metals: Object.freeze(['niobium', 'rare earths', 'zirconium', 'uranium']),
    }),
]);

export const METAL_PROVINCES = Object.freeze([
    Object.freeze({
        code: 'background', name: 'No dominant signal', color: [0.66, 0.65, 0.60],
        metals: Object.freeze([]),
    }),
    Object.freeze({
        code: 'arc_hydrothermal', name: 'Arc and felsic hydrothermal', color: [0.91, 0.22, 0.12],
        metals: Object.freeze(['copper', 'gold', 'silver', 'molybdenum', 'tin']),
    }),
    Object.freeze({
        code: 'orogenic_gold', name: 'Orogenic veins', color: [0.93, 0.68, 0.08],
        metals: Object.freeze(['gold', 'silver', 'tungsten', 'antimony']),
    }),
    Object.freeze({
        code: 'vms_base_metals', name: 'Volcanic massive sulfide', color: [0.10, 0.58, 0.78],
        metals: Object.freeze(['copper', 'zinc', 'lead', 'silver', 'gold']),
    }),
    Object.freeze({
        code: 'mafic_magmatic', name: 'Mafic magmatic', color: [0.18, 0.50, 0.29],
        metals: Object.freeze(['iron', 'nickel', 'cobalt', 'chromium', 'vanadium', 'platinum']),
    }),
    Object.freeze({
        code: 'craton_related', name: 'Ancient craton', color: [0.61, 0.29, 0.72],
        metals: Object.freeze(['iron', 'gold', 'uranium']),
        otherResources: Object.freeze(['diamond']),
    }),
    Object.freeze({
        code: 'sedimentary', name: 'Sedimentary and residual', color: [0.55, 0.42, 0.24],
        metals: Object.freeze(['iron', 'manganese', 'aluminum', 'copper', 'lead', 'zinc', 'uranium']),
    }),
    Object.freeze({
        code: 'placer', name: 'Placer and alluvial', color: [0.98, 0.87, 0.30],
        metals: Object.freeze(['gold', 'tin', 'platinum', 'titanium']),
    }),
]);

function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value >= edge1 ? 1 : 0;
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function sampledAbsScale(values, fallback = 1) {
    if (!values?.length) return fallback;
    const sample = [];
    const step = Math.max(1, Math.floor(values.length / 2048));
    for (let i = 0; i < values.length; i += step) {
        const v = Math.abs(values[i]);
        if (Number.isFinite(v)) sample.push(v);
    }
    if (!sample.length) return fallback;
    sample.sort((a, b) => a - b);
    return Math.max(fallback * 1e-6, sample[Math.floor((sample.length - 1) * 0.98)] || fallback);
}

function slopeField(mesh, elevations) {
    const result = new Float32Array(mesh.numRegions);
    const { adjOffset, adjList } = mesh;
    for (let r = 0; r < mesh.numRegions; r++) {
        let maxDifference = 0;
        const h = elevToHeightKm(elevations[r]);
        for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
            maxDifference = Math.max(maxDifference, Math.abs(h - elevToHeightKm(elevations[adjList[i]])));
        }
        result[r] = clamp01(maxDifference / 1.25);
    }
    return result;
}

function oceanCrustAge(mesh, elevations, margins) {
    const n = mesh.numRegions;
    const distance = new Int32Array(n);
    distance.fill(-1);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    for (let r = 0; r < n; r++) {
        if (elevations[r] <= 0 && (margins?.[r] ?? 0) >= 0.9) {
            distance[r] = 0;
            queue[tail++] = r;
        }
    }

    // If a generated map has no explicit ridge cells, the youngest/deepest
    // ocean-floor diagnostic still gives us deterministic spreading seeds.
    if (tail === 0) {
        for (let r = 0; r < n; r++) {
            if (elevations[r] <= 0 && (margins?.[r] ?? 0) > 0.45) {
                distance[r] = 0;
                queue[tail++] = r;
            }
        }
    }

    const { adjOffset, adjList } = mesh;
    while (head < tail) {
        const r = queue[head++];
        for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
            const nb = adjList[i];
            if (elevations[nb] > 0 || distance[nb] >= 0) continue;
            distance[nb] = distance[r] + 1;
            queue[tail++] = nb;
        }
    }

    const cellKm = Math.sqrt(4 * Math.PI * EARTH_RADIUS_KM * EARTH_RADIUS_KM / Math.max(1, n));
    const agePerStep = cellKm / 30; // 30 km/Ma half-spreading-rate approximation
    const age = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        if (elevations[r] > 0) continue;
        age[r] = Math.min(220, distance[r] >= 0 ? distance[r] * agePerStep : 180);
    }
    return age;
}

function accumulatePlacerSources(mesh, receiver, source, riverStrength, slope, deposition) {
    const n = mesh.numRegions;
    const potential = new Float32Array(n);
    if (!receiver || !riverStrength) return potential;

    const indegree = new Int32Array(n);
    const accumulated = new Float32Array(source);
    const sourceCells = new Float32Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    for (let r = 0; r < n; r++) {
        sourceCells[r] = source[r] > 0.25 ? 1 : 0;
        const down = receiver[r];
        if (down >= 0 && down < n && down !== r) indegree[down]++;
    }
    for (let r = 0; r < n; r++) if (indegree[r] === 0) queue[tail++] = r;

    while (head < tail) {
        const r = queue[head++];
        const down = receiver[r];
        if (down < 0 || down >= n || down === r) continue;
        accumulated[down] += accumulated[r];
        sourceCells[down] += sourceCells[r];
        if (--indegree[down] === 0) queue[tail++] = down;
    }

    let maxAccumulated = 0;
    for (let r = 0; r < n; r++) {
        if (riverStrength[r] > 0) maxAccumulated = Math.max(maxAccumulated, accumulated[r]);
    }
    const denominator = Math.log1p(maxAccumulated) || 1;
    for (let r = 0; r < n; r++) {
        if (riverStrength[r] <= 0 || sourceCells[r] < 1) continue;
        const routedSource = Math.log1p(accumulated[r]) / denominator;
        const trap = 0.25 + 0.45 * (1 - slope[r]) + 0.30 * deposition[r];
        potential[r] = clamp01(routedSource * (0.35 + 0.65 * riverStrength[r]) * trap);
    }
    return potential;
}

function selectMetalProvince(arrays, index) {
    let bestId = 0;
    let best = 0.34;
    for (let id = 1; id <= 7; id++) {
        const value = arrays[id - 1][index];
        if (value > best) {
            best = value;
            bestId = id;
        }
    }
    return bestId;
}

/**
 * Infer broad regional geology and metallogenic favorability.
 * Returns null for imported heightmaps because they do not contain tectonic
 * provenance fields needed to distinguish geologic settings.
 */
export function computeRegionalGeology(mesh, r_xyz, r_elevation, options = {}) {
    const debug = options.debugLayers || {};
    if (!debug.cratonWeight || !debug.foldBeltWeight || !debug.basinWeight) return null;

    const n = mesh.numRegions;
    const seed = options.seed || 0;
    const noise = new SimplexNoise(seed + 0x51f15e);
    const slope = slopeField(mesh, r_elevation);
    const oceanAge = oceanCrustAge(mesh, r_elevation, debug.margins);

    const hotspotScale = sampledAbsScale(debug.hotspot, 0.05);
    const lipScale = sampledAbsScale(debug.lip, 0.05);
    const backArcScale = sampledAbsScale(debug.backArc, 0.05);
    const stressScale = sampledAbsScale(options.r_stress, 0.1);
    const erosionScale = sampledAbsScale(debug.erosionDelta, 0.01);
    const mantleScale = sampledAbsScale(debug.mantleFlow, 0.05);

    const lithology = new Uint8Array(n);
    const basementAge = new Float32Array(n);
    const surfaceAge = new Float32Array(n);
    const intrusiveStrength = new Float32Array(n);
    const intrusiveType = new Uint8Array(n);
    const metamorphicGrade = new Float32Array(n);
    const sedimentThickness = new Float32Array(n);

    const metalArc = new Float32Array(n);
    const metalOrogenic = new Float32Array(n);
    const metalVms = new Float32Array(n);
    const metalMafic = new Float32Array(n);
    const metalCraton = new Float32Array(n);
    const metalSedimentary = new Float32Array(n);
    const deposition = new Float32Array(n);
    const sourcePotential = new Float32Array(n);

    for (let r = 0; r < n; r++) {
        const x = r_xyz[r * 3];
        const y = r_xyz[r * 3 + 1];
        const z = r_xyz[r * 3 + 2];
        const provinceNoise = clamp01(0.5 + 0.5 * noise.fbm(x * 2.2, y * 2.2, z * 2.2, 4, 0.58));
        const detailNoise = clamp01(0.5 + 0.5 * noise.fbm(x * 7.5 + 11, y * 7.5 - 7, z * 7.5 + 3, 3, 0.55));
        const favorabilityNoise = 0.68 + 0.42 * detailNoise;

        const isLand = r_elevation[r] > 0;
        const craton = clamp01(debug.cratonWeight[r]);
        const fold = clamp01(debug.foldBeltWeight[r]);
        const basin = clamp01(debug.basinWeight[r]);
        const activity = clamp01(debug.tecActivity?.[r]);
        const orogenic = clamp01((debug.orogenicPower?.[r] ?? -0.5) + 0.5);
        const ridge = smoothstep(0.72, 0.98, debug.margins?.[r] ?? 0);
        const activeMargin = smoothstep(0.45, 0.82, debug.margins?.[r] ?? 0);
        const hotspot = clamp01(Math.abs(debug.hotspot?.[r] ?? 0) / hotspotScale);
        const lip = clamp01(Math.abs(debug.lip?.[r] ?? 0) / lipScale);
        const backArc = clamp01(Math.abs(debug.backArc?.[r] ?? 0) / backArcScale);
        const stress = clamp01(Math.abs(options.r_stress?.[r] ?? 0) / stressScale);
        const mantle = clamp01(Math.abs(debug.mantleFlow?.[r] ?? 0) / mantleScale);
        const erosion = clamp01(-(debug.erosionDelta?.[r] ?? 0) / erosionScale);
        deposition[r] = clamp01((debug.erosionDelta?.[r] ?? 0) / erosionScale);

        if (!isLand) {
            basementAge[r] = oceanAge[r];
            sedimentThickness[r] = Math.min(4.5, 0.10 + oceanAge[r] * 0.018 + basin * 1.2);
            lithology[r] = oceanAge[r] < 18 || ridge > 0.45 ? 1 : 0;
            surfaceAge[r] = lithology[r] === 1 ? Math.min(25, oceanAge[r]) : Math.min(80, 2 + sedimentThickness[r] * 12);
            // Oceanic VMS is restricted to spreading and back-arc systems;
            // generic tectonic activity alone should not paint old seafloor.
            const ridgeFocus = ridge *
                smoothstep(-5.2, -1.2, elevToHeightKm(r_elevation[r])) *
                smoothstep(0.30, 0.76, detailNoise);
            metalVms[r] = clamp01((
                0.86 * ridgeFocus + 0.32 * backArc * activeMargin * detailNoise +
                0.12 * activity * ridgeFocus
            ) * favorabilityNoise);
            continue;
        }

        const basement = 180 + 2850 * craton + 420 * provinceNoise - 700 * fold - 380 * activity;
        basementAge[r] = Math.max(35, Math.min(3800, basement));

        const intrusion = clamp01(
            0.34 * activity + 0.28 * fold + 0.24 * orogenic +
            0.20 * activeMargin + 0.26 * hotspot + 0.24 * lip + 0.15 * backArc -
            0.18 * craton,
        ) * favorabilityNoise;
        intrusiveStrength[r] = clamp01(intrusion);
        if (intrusiveStrength[r] > 0.28) {
            if (hotspot > 0.55 && lip < 0.45) intrusiveType[r] = 4;
            else if (lip > 0.45 || (mantle > 0.55 && activity < 0.55)) intrusiveType[r] = 3;
            else if (activeMargin > 0.35 || backArc > 0.35) intrusiveType[r] = 2;
            else intrusiveType[r] = 1;
        }

        metamorphicGrade[r] = clamp01(
            (0.42 * fold + 0.32 * stress + 0.24 * orogenic + 0.18 * intrusiveStrength[r]) * favorabilityNoise,
        );

        const precip = clamp01(((options.r_precip_summer?.[r] ?? 0.5) + (options.r_precip_winter?.[r] ?? 0.5)) * 0.5);
        const dry = 1 - precip;
        const lowRelief = 1 - slope[r];
        const tropicalWeathering = clamp01(
            (1 - Math.abs(y)) * precip * lowRelief * (0.45 + 0.55 * craton),
        );
        sedimentThickness[r] = Math.min(9,
            0.12 + 5.8 * basin * (0.45 + 0.55 * lowRelief) +
            1.6 * deposition[r] + 0.6 * (1 - craton),
        );

        if (lip > 0.52) lithology[r] = 10;
        else if (intrusiveStrength[r] > 0.70 && (erosion > 0.35 || slope[r] > 0.55)) lithology[r] = 11;
        else if (activeMargin > 0.48 && activity > 0.38) lithology[r] = 4;
        else if (metamorphicGrade[r] > 0.58 && fold > 0.42) lithology[r] = 5;
        else if (deposition[r] > 0.55 && lowRelief > 0.50) lithology[r] = 12;
        else if (basin > 0.43) {
            if (dry > 0.72 && sedimentThickness[r] > 2.0) lithology[r] = 9;
            else if (Math.abs(y) < 0.72 && precip > 0.38 && precip < 0.78) lithology[r] = 8;
            else if (precip > 0.58) lithology[r] = 7;
            else lithology[r] = 6;
        } else if (craton > 0.47) lithology[r] = 3;
        else if (intrusiveType[r] === 3 || intrusiveType[r] === 4) lithology[r] = 2;
        else if (fold > 0.42) lithology[r] = 5;
        else lithology[r] = provinceNoise > 0.52 ? 6 : 3;

        switch (lithology[r]) {
            case 4: case 10: surfaceAge[r] = 2 + 85 * (1 - activity) * provinceNoise; break;
            case 11: surfaceAge[r] = 18 + 220 * (1 - intrusiveStrength[r]) * provinceNoise; break;
            case 12: surfaceAge[r] = 0.02 + 3 * (1 - deposition[r]); break;
            case 6: case 7: case 8: case 9: surfaceAge[r] = 8 + 280 * (1 - basin) * provinceNoise; break;
            case 5: surfaceAge[r] = Math.min(basementAge[r], 80 + 520 * (1 - metamorphicGrade[r])); break;
            default: surfaceAge[r] = basementAge[r];
        }

        metalArc[r] = clamp01((
            0.38 * activeMargin + 0.29 * activity + 0.25 * intrusiveStrength[r] +
            0.18 * backArc + 0.12 * orogenic +
            0.15 * (intrusiveType[r] === 1 ? 1 : 0)
        ) * favorabilityNoise);
        metalOrogenic[r] = clamp01((
            0.38 * fold + 0.25 * metamorphicGrade[r] + 0.22 * stress +
            0.16 * erosion + 0.10 * intrusiveStrength[r]
        ) * favorabilityNoise);
        metalVms[r] = clamp01((
            0.30 * activeMargin + 0.31 * backArc + 0.24 * activity +
            0.17 * intrusiveStrength[r]
        ) * favorabilityNoise);
        metalMafic[r] = clamp01((
            0.38 * lip + 0.28 * hotspot + 0.20 * mantle +
            0.22 * (intrusiveType[r] === 3 ? 1 : 0) + 0.10 * erosion
        ) * favorabilityNoise);
        metalCraton[r] = clamp01((
            0.52 * craton + 0.22 * smoothstep(1800, 3200, basementAge[r]) +
            0.14 * mantle + 0.10 * erosion
        ) * favorabilityNoise);
        metalSedimentary[r] = clamp01((
            0.42 * basin + 0.25 * clamp01(sedimentThickness[r] / 6) +
            0.12 * lowRelief + 0.10 * dry + 0.08 * deposition[r] +
            0.24 * tropicalWeathering
        ) * favorabilityNoise);

        sourcePotential[r] = clamp01(
            Math.max(metalArc[r], metalOrogenic[r], metalMafic[r], metalCraton[r]) *
            (0.50 + 0.35 * erosion + 0.15 * slope[r]),
        );
    }

    const metalPlacer = accumulatePlacerSources(
        mesh,
        options.r_flow_receiver,
        sourcePotential,
        options.r_river_strength,
        slope,
        deposition,
    );
    const metalProvince = new Uint8Array(n);
    const metalArrays = [metalArc, metalOrogenic, metalVms, metalMafic, metalCraton, metalSedimentary, metalPlacer];
    for (let r = 0; r < n; r++) {
        const province = selectMetalProvince(metalArrays, r);
        // Keep the combined province map readable: only the strongest seafloor
        // VMS signals become provinces, while the individual VMS layer retains
        // the full continuous favorability field.
        metalProvince[r] = r_elevation[r] <= 0 && metalVms[r] < 0.58 ? 0 : province;
    }

    return {
        r_surface_lithology: lithology,
        r_basement_age_ma: basementAge,
        r_surface_age_ma: surfaceAge,
        r_intrusive_strength: intrusiveStrength,
        r_intrusive_type: intrusiveType,
        r_metamorphic_grade: metamorphicGrade,
        r_sediment_thickness_km: sedimentThickness,
        r_metal_province: metalProvince,
        r_metal_arc: metalArc,
        r_metal_orogenic: metalOrogenic,
        r_metal_vms: metalVms,
        r_metal_mafic: metalMafic,
        r_metal_craton: metalCraton,
        r_metal_sedimentary: metalSedimentary,
        r_metal_placer: metalPlacer,
        debugLayers: {
            surfaceLithology: lithology,
            basementAge,
            surfaceAge,
            intrusiveBodies: intrusiveStrength,
            metamorphicGrade,
            sedimentThickness,
            metalProvince,
            metalArc,
            metalOrogenic,
            metalVms,
            metalMafic,
            metalCraton,
            metalSedimentary,
            metalPlacer,
        },
    };
}

