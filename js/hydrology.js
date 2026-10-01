// Drainage routing and precipitation-weighted flow accumulation.
//
// The mesh is close to equal-area, so one unit of local runoff per region is
// a useful relative area measure. Values are deliberately relative rather
// than pretending the climate model produces calibrated discharge units.

import { elevToHeightKm } from './color-map.js';

const SURFACE_EPSILON = 1e-7;
const MIN_LAKE_DEPTH_KM = 0.025;

class MinHeap {
    constructor() {
        this.regions = [];
        this.priorities = [];
    }

    get size() { return this.regions.length; }

    push(region, priority) {
        let i = this.regions.length;
        this.regions.push(region);
        this.priorities.push(priority);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.priorities[parent] <= priority) break;
            this.regions[i] = this.regions[parent];
            this.priorities[i] = this.priorities[parent];
            i = parent;
        }
        this.regions[i] = region;
        this.priorities[i] = priority;
    }

    pop() {
        const region = this.regions[0];
        const lastRegion = this.regions.pop();
        const lastPriority = this.priorities.pop();
        if (this.regions.length > 0) {
            let i = 0;
            while (true) {
                const left = i * 2 + 1;
                if (left >= this.regions.length) break;
                const right = left + 1;
                const child = right < this.regions.length &&
                    this.priorities[right] < this.priorities[left] ? right : left;
                if (this.priorities[child] >= lastPriority) break;
                this.regions[i] = this.regions[child];
                this.priorities[i] = this.priorities[child];
                i = child;
            }
            this.regions[i] = lastRegion;
            this.priorities[i] = lastPriority;
        }
        return region;
    }
}

function clampRunoff(value) {
    if (!Number.isFinite(value)) return 0.02;
    return Math.max(0.02, Math.min(1.5, value));
}

function normalizeLog(values, isLand) {
    const result = new Float32Array(values.length);
    let maxValue = 0;
    for (let r = 0; r < values.length; r++) {
        if (isLand[r] && values[r] > maxValue) maxValue = values[r];
    }
    const denominator = Math.log1p(maxValue) || 1;
    for (let r = 0; r < values.length; r++) {
        if (isLand[r]) result[r] = Math.log1p(Math.max(0, values[r])) / denominator;
    }
    return result;
}

function labelLakeCandidates(mesh, candidateDepth) {
    const { adjOffset, adjList, numRegions } = mesh;
    const lakeId = new Int32Array(numRegions);
    lakeId.fill(-1);
    const queue = new Int32Array(numRegions);
    let lakeCount = 0;

    for (let start = 0; start < numRegions; start++) {
        if (candidateDepth[start] < MIN_LAKE_DEPTH_KM || lakeId[start] >= 0) continue;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        lakeId[start] = lakeCount;
        while (head < tail) {
            const r = queue[head++];
            for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
                const nb = adjList[i];
                if (candidateDepth[nb] < MIN_LAKE_DEPTH_KM || lakeId[nb] >= 0) continue;
                lakeId[nb] = lakeCount;
                queue[tail++] = nb;
            }
        }
        lakeCount++;
    }

    return { lakeId, lakeCount };
}

/**
 * Build a depression-conditioned drainage graph and accumulate seasonal
 * precipitation through it. Receivers point toward an ocean outlet and are
 * acyclic because they always refer to an earlier priority-flood visit.
 */
export function computeHydrology(mesh, r_elevation, r_precip_summer, r_precip_winter) {
    const { adjOffset, adjList, numRegions } = mesh;
    const isLand = new Uint8Array(numRegions);
    const visited = new Uint8Array(numRegions);
    const conditionedSurface = new Float32Array(r_elevation);
    const receiver = new Int32Array(numRegions);
    receiver.fill(-1);
    const visitOrder = new Int32Array(numRegions);
    const heap = new MinHeap();

    let landCount = 0;
    for (let r = 0; r < numRegions; r++) {
        if (r_elevation[r] > 0) {
            isLand[r] = 1;
            landCount++;
        } else {
            visited[r] = 1;
        }
    }

    // Every coastal land cell is a valid outlet into its adjacent water body.
    for (let r = 0; r < numRegions; r++) {
        if (!isLand[r]) continue;
        for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
            if (!isLand[adjList[i]]) {
                visited[r] = 1;
                heap.push(r, conditionedSurface[r]);
                break;
            }
        }
    }

    let orderLength = 0;
    const drainHeap = () => {
        while (heap.size > 0) {
            const r = heap.pop();
            visitOrder[orderLength++] = r;
            for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
                const nb = adjList[i];
                if (visited[nb] || !isLand[nb]) continue;
                visited[nb] = 1;
                receiver[nb] = r;
                conditionedSurface[nb] = Math.max(
                    r_elevation[nb],
                    conditionedSurface[r] + SURFACE_EPSILON,
                );
                heap.push(nb, conditionedSurface[nb]);
            }
        }
    };

    drainHeap();

    // A completely land-covered world, or a malformed disconnected component,
    // still receives a stable local outlet at its lowest unvisited point.
    while (orderLength < landCount) {
        let seed = -1;
        let lowest = Infinity;
        for (let r = 0; r < numRegions; r++) {
            if (isLand[r] && !visited[r] && r_elevation[r] < lowest) {
                seed = r;
                lowest = r_elevation[r];
            }
        }
        if (seed < 0) break;
        visited[seed] = 1;
        heap.push(seed, conditionedSurface[seed]);
        drainHeap();
    }

    const lakeDepthKm = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        if (!isLand[r]) continue;
        const depth = elevToHeightKm(conditionedSurface[r]) - elevToHeightKm(r_elevation[r]);
        if (depth >= MIN_LAKE_DEPTH_KM) lakeDepthKm[r] = depth;
    }
    const { lakeId, lakeCount } = labelLakeCandidates(mesh, lakeDepthKm);

    const catchmentCells = new Float32Array(numRegions);
    const flowSummer = new Float32Array(numRegions);
    const flowWinter = new Float32Array(numRegions);
    const flowAnnual = new Float32Array(numRegions);
    let totalLocalAnnual = 0;

    for (let r = 0; r < numRegions; r++) {
        if (!isLand[r]) continue;
        const summer = clampRunoff(r_precip_summer?.[r]);
        const winter = clampRunoff(r_precip_winter?.[r]);
        const annual = (summer + winter) * 0.5;
        catchmentCells[r] = 1;
        flowSummer[r] = summer;
        flowWinter[r] = winter;
        flowAnnual[r] = annual;
        totalLocalAnnual += annual;
    }

    for (let i = orderLength - 1; i >= 0; i--) {
        const r = visitOrder[i];
        const down = receiver[r];
        if (down < 0) continue;
        catchmentCells[down] += catchmentCells[r];
        flowSummer[down] += flowSummer[r];
        flowWinter[down] += flowWinter[r];
        flowAnnual[down] += flowAnnual[r];
    }

    const accumulationSummer = normalizeLog(flowSummer, isLand);
    const accumulationWinter = normalizeLog(flowWinter, isLand);
    const accumulationAnnual = normalizeLog(flowAnnual, isLand);
    const riverStrength = new Float32Array(numRegions);
    const riverSeasonality = new Float32Array(numRegions);
    const meanLocalAnnual = totalLocalAnnual / Math.max(1, landCount);
    const riverThreshold = Math.max(meanLocalAnnual * 8, totalLocalAnnual * 0.00015);
    let maxAnnual = riverThreshold;
    for (let r = 0; r < numRegions; r++) {
        if (flowAnnual[r] > maxAnnual) maxAnnual = flowAnnual[r];
    }
    const logThreshold = Math.log1p(riverThreshold);
    const riverDenominator = Math.max(1e-9, Math.log1p(maxAnnual) - logThreshold);
    for (let r = 0; r < numRegions; r++) {
        if (!isLand[r] || flowAnnual[r] < riverThreshold) continue;
        const strength = Math.max(0, Math.min(1,
            (Math.log1p(flowAnnual[r]) - logThreshold) / riverDenominator,
        ));
        riverStrength[r] = strength;
        const seasonalTotal = flowSummer[r] + flowWinter[r];
        riverSeasonality[r] = seasonalTotal > 0
            ? (flowSummer[r] - flowWinter[r]) / seasonalTotal
            : 0;
    }

    const lakeDepth = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        lakeDepth[r] = Math.min(1, lakeDepthKm[r]);
    }

    return {
        r_flow_receiver: receiver,
        r_catchment_cells: catchmentCells,
        r_flow_accumulation_summer: flowSummer,
        r_flow_accumulation_winter: flowWinter,
        r_flow_accumulation_annual: flowAnnual,
        r_river_strength: riverStrength,
        r_river_seasonality: riverSeasonality,
        r_lake_depth_km: lakeDepthKm,
        r_lake_id: lakeId,
        lakeCount,
        debugLayers: {
            flowAccumulationSummer: accumulationSummer,
            flowAccumulationWinter: accumulationWinter,
            flowAccumulationAnnual: accumulationAnnual,
            riversAnnual: riverStrength,
            riverSeasonality,
            lakeDepth,
        },
    };
}
