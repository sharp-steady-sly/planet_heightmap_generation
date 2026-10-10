// Seasonal severe-weather climatology derived from the generator's broad
// pressure, wind, temperature, precipitation, ocean, and terrain fields.
// Values are relative environmental favorability, not event probabilities.

import { smoothField } from './climate-util.js';
import { elevToHeightKm } from './color-map.js';

const DEG = Math.PI / 180;

export const WEATHER_HAZARD_CLASSES = Object.freeze([
    Object.freeze({ code: 'low_signal', name: 'Low severe-weather signal', color: [0.60, 0.62, 0.62] }),
    Object.freeze({ code: 'tropical_cyclone', name: 'Tropical cyclone exposure', color: [0.04, 0.62, 0.74] }),
    Object.freeze({ code: 'severe_thunderstorm', name: 'Severe thunderstorm', color: [0.94, 0.62, 0.08] }),
    Object.freeze({ code: 'tornado_environment', name: 'Tornado environment', color: [0.82, 0.13, 0.12] }),
    Object.freeze({ code: 'blizzard', name: 'Blizzard', color: [0.55, 0.80, 0.96] }),
    Object.freeze({ code: 'extratropical_storm', name: 'Extratropical storm', color: [0.31, 0.36, 0.76] }),
    Object.freeze({ code: 'monsoon_storm', name: 'Monsoon storm', color: [0.13, 0.58, 0.27] }),
    Object.freeze({ code: 'mountain_storm', name: 'Mountain storm', color: [0.58, 0.31, 0.67] }),
]);

function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value >= edge1 ? 1 : 0;
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function sampledPercentile(values, quantile, absolute = false) {
    const sample = [];
    const step = Math.max(1, Math.floor(values.length / 4096));
    for (let i = 0; i < values.length; i += step) {
        const value = absolute ? Math.abs(values[i]) : values[i];
        if (Number.isFinite(value)) sample.push(value);
    }
    if (!sample.length) return 1;
    sample.sort((a, b) => a - b);
    return sample[Math.min(sample.length - 1, Math.floor((sample.length - 1) * quantile))] || 1;
}

function normalizePositive(values, quantile = 0.97) {
    const scale = sampledPercentile(values, quantile);
    if (scale <= 1e-8) return values;
    for (let i = 0; i < values.length; i++) values[i] = clamp01(values[i] / scale);
    return values;
}

function tangentFrame(x, y, z) {
    let ex = z, ez = -x;
    const eLength = Math.hypot(ex, ez) || 1;
    ex /= eLength;
    ez /= eLength;
    let nx = y * ez;
    let ny = z * ex - x * ez;
    let nz = -y * ex;
    const nLength = Math.hypot(nx, ny, nz) || 1;
    nx /= nLength;
    ny /= nLength;
    nz /= nLength;
    return { ex, ez, nx, ny, nz };
}

function computeSeasonDiagnostics(mesh, r_xyz, windEast, windNorth, temperature) {
    const { numRegions, adjOffset, adjList } = mesh;
    const divergence = new Float32Array(numRegions);
    const rotation = new Float32Array(numRegions);
    const front = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        const frame = tangentFrame(x, y, z);
        let div = 0, curl = 0, maxTempDelta = 0, count = 0;
        for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
            const nb = adjList[i];
            const dx = r_xyz[3 * nb] - x;
            const dy = r_xyz[3 * nb + 1] - y;
            const dz = r_xyz[3 * nb + 2] - z;
            const de = dx * frame.ex + dz * frame.ez;
            const dn = dx * frame.nx + dy * frame.ny + dz * frame.nz;
            const distance = Math.hypot(de, dn) || 1;
            const edgeE = de / distance;
            const edgeN = dn / distance;
            const du = windEast[nb] - windEast[r];
            const dv = windNorth[nb] - windNorth[r];
            div += du * edgeE + dv * edgeN;
            curl += dv * edgeE - du * edgeN;
            maxTempDelta = Math.max(maxTempDelta, Math.abs(temperature[nb] - temperature[r]));
            count++;
        }
        divergence[r] = count ? div / count : 0;
        rotation[r] = count ? curl / count : 0;
        front[r] = maxTempDelta;
    }

    const divScale = sampledPercentile(divergence, 0.95, true);
    const rotScale = sampledPercentile(rotation, 0.95, true);
    const frontScale = sampledPercentile(front, 0.95);
    const convergence = new Float32Array(numRegions);
    const vorticity = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        convergence[r] = clamp01(-divergence[r] / divScale);
        vorticity[r] = clamp01(Math.abs(rotation[r]) / rotScale);
        front[r] = clamp01(front[r] / frontScale);
    }
    return { convergence, vorticity, front };
}

function computeRelief(mesh, r_elevation) {
    const { numRegions, adjOffset, adjList } = mesh;
    const relief = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        const center = elevToHeightKm(r_elevation[r]);
        let delta = 0;
        for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
            delta = Math.max(delta, Math.abs(elevToHeightKm(r_elevation[adjList[i]]) - center));
        }
        relief[r] = delta;
    }
    normalizePositive(relief, 0.97);
    return relief;
}

function propagateCycloneExposure(mesh, r_xyz, r_elevation, source, windEast, windNorth) {
    const { numRegions, adjOffset, adjList } = mesh;
    let current = new Float32Array(source);
    let next = new Float32Array(numRegions);
    const flowX = new Float32Array(numRegions);
    const flowY = new Float32Array(numRegions);
    const flowZ = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        const frame = tangentFrame(r_xyz[3 * r], r_xyz[3 * r + 1], r_xyz[3 * r + 2]);
        const length = Math.hypot(windEast[r], windNorth[r]) || 1;
        flowX[r] = (frame.ex * windEast[r] + frame.nx * windNorth[r]) / length;
        flowY[r] = frame.ny * windNorth[r] / length;
        flowZ[r] = (frame.ez * windEast[r] + frame.nz * windNorth[r]) / length;
    }
    const passes = Math.min(16, Math.max(9, Math.round(Math.sqrt(numRegions) / 50)));

    for (let pass = 0; pass < passes; pass++) {
        next.set(current);
        for (let r = 0; r < numRegions; r++) {
            const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
            let best = current[r];
            for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
                const nb = adjList[i];
                if (current[nb] <= best * 0.7) continue;
                const dx = x - r_xyz[3 * nb];
                const dy = y - r_xyz[3 * nb + 1];
                const dz = z - r_xyz[3 * nb + 2];
                const edgeLength = Math.hypot(dx, dy, dz) || 1;
                const alignment = Math.max(0,
                    (flowX[nb] * dx + flowY[nb] * dy + flowZ[nb] * dz) / edgeLength,
                );
                const directional = 0.58 + 0.42 * alignment;
                const decay = r_elevation[r] > 0 ? 0.82 : 0.97;
                best = Math.max(best, current[nb] * directional * decay);
            }
            next[r] = best;
        }
        [current, next] = [next, current];
    }
    return current;
}

function computeSeason(mesh, r_xyz, r_elevation, windResult, precipResult, tempResult, season, relief) {
    const n = mesh.numRegions;
    const windEast = windResult[`r_wind_east_${season}`];
    const windNorth = windResult[`r_wind_north_${season}`];
    const windSpeed = windResult[`r_wind_speed_${season}`];
    const pressure = windResult[`r_pressure_${season}`];
    const precip = precipResult[`r_precip_${season}`];
    const temperature = tempResult[`r_temperature_${season}`];
    const otherPrecip = precipResult[`r_precip_${season === 'summer' ? 'winter' : 'summer'}`];
    const continentality = windResult.r_continentality;
    const { convergence, vorticity, front } = computeSeasonDiagnostics(
        mesh, r_xyz, windEast, windNorth, temperature,
    );
    const pressureScale = sampledPercentile(pressure, 0.95, true);

    const cycloneGenesis = new Float32Array(n);
    const severeStorm = new Float32Array(n);
    const tornado = new Float32Array(n);
    const blizzard = new Float32Array(n);
    const extratropical = new Float32Array(n);
    const monsoon = new Float32Array(n);
    const mountain = new Float32Array(n);

    for (let r = 0; r < n; r++) {
        const y = Math.max(-1, Math.min(1, r_xyz[3 * r + 1]));
        const latDeg = Math.abs(Math.asin(y) / DEG);
        const isLand = r_elevation[r] > 0;
        const tempC = temperature[r] * 90 - 45;
        const warm = smoothstep(10, 30, tempC);
        const tropicalWarm = smoothstep(24, 29, tempC);
        const cold = smoothstep(2, -10, tempC);
        const moisture = clamp01(isLand
            ? precip[r] * 0.68 + (1 - (continentality?.[r] || 0)) * 0.32
            : 0.52 + precip[r] * 0.48);
        const lowPressure = clamp01(-pressure[r] / pressureScale);
        const speed = clamp01(windSpeed[r]);

        const windLength = Math.hypot(windEast[r], windNorth[r]) || 1;
        const surfaceE = windEast[r] / windLength;
        const surfaceN = windNorth[r] / windLength;
        const upperE = smoothstep(20, 42, latDeg) * (1 - smoothstep(68, 82, latDeg)) * 2 - 0.55;
        const upperN = (season === 'summer' ? 0.12 : -0.12) * Math.sign(y || 1);
        const upperLength = Math.hypot(upperE, upperN) || 1;
        const directionalShear = clamp01((1 - (surfaceE * upperE + surfaceN * upperN) / upperLength) * 0.5);
        const shear = clamp01(directionalShear * 0.72 + speed * 0.28);

        const cycloneLatitude = smoothstep(4, 9, latDeg) * (1 - smoothstep(28, 38, latDeg));
        const cycloneDynamics = 0.30 + moisture * 0.20 + vorticity[r] * 0.20
            + convergence[r] * 0.15 + lowPressure * 0.15;
        cycloneGenesis[r] = isLand ? 0
            : clamp01(tropicalWarm * cycloneLatitude * cycloneDynamics * (1 - shear * 0.72));

        const instability = warm * moisture;
        severeStorm[r] = isLand ? clamp01(
            instability * (0.38 + convergence[r] * 0.24 + front[r] * 0.23 + speed * 0.15),
        ) : 0;
        const lowland = 1 - smoothstep(0.35, 0.9, relief[r]);
        tornado[r] = isLand ? clamp01(
            severeStorm[r] * (0.20 + shear * 0.80) * (0.35 + convergence[r] * 0.65)
                * (0.48 + front[r] * 0.52) * (0.55 + lowland * 0.45),
        ) : 0;
        blizzard[r] = isLand ? clamp01(
            cold * Math.sqrt(clamp01(precip[r])) * (0.25 + speed * 0.75)
                * (0.72 + lowland * 0.28),
        ) : 0;
        const midLatitude = smoothstep(25, 38, latDeg) * (1 - smoothstep(67, 80, latDeg));
        extratropical[r] = clamp01(
            midLatitude * (0.15 + front[r] * 0.42 + speed * 0.20
                + convergence[r] * 0.13 + lowPressure * 0.10),
        );
        const wetSeasonContrast = clamp01((precip[r] - otherPrecip[r]) * 2.5);
        const monsoonLatitude = 1 - smoothstep(28, 42, latDeg);
        monsoon[r] = isLand ? clamp01(
            warm * precip[r] * wetSeasonContrast * monsoonLatitude
                * (0.55 + convergence[r] * 0.45),
        ) : 0;
        const highTerrain = clamp01(smoothstep(0.6, 2.5, elevToHeightKm(r_elevation[r])) * 0.55 + relief[r] * 0.45);
        mountain[r] = isLand ? clamp01(
            highTerrain * Math.sqrt(clamp01(precip[r])) * (0.45 + speed * 0.35 + convergence[r] * 0.20),
        ) : 0;
    }

    smoothField(mesh, cycloneGenesis, 1);
    smoothField(mesh, severeStorm, 1);
    smoothField(mesh, tornado, 1);
    smoothField(mesh, blizzard, 1);
    smoothField(mesh, extratropical, 1);
    smoothField(mesh, monsoon, 1);
    smoothField(mesh, mountain, 1);

    // Genesis is constrained to a small fraction of the ocean, so its raw
    // multiplicative score is much lower than the broad land hazards. Scale
    // only its upper tail to the shared relative 0..1 atlas range.
    normalizePositive(cycloneGenesis, 0.995);

    const cycloneExposure = propagateCycloneExposure(
        mesh, r_xyz, r_elevation, cycloneGenesis, windEast, windNorth,
    );
    const severity = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        severity[r] = Math.max(
            cycloneExposure[r], severeStorm[r], tornado[r], blizzard[r],
            extratropical[r], monsoon[r], mountain[r],
        );
    }

    return {
        cycloneGenesis, cycloneExposure, severeStorm, tornado, blizzard,
        extratropical, monsoon, mountain, severity,
    };
}

export function computeWeatherHazards(mesh, r_xyz, r_elevation, windResult, oceanResult, precipResult, tempResult) {
    if (!windResult || !precipResult || !tempResult) return null;
    const relief = computeRelief(mesh, r_elevation);
    const summer = computeSeason(mesh, r_xyz, r_elevation, windResult, precipResult, tempResult, 'summer', relief);
    const winter = computeSeason(mesh, r_xyz, r_elevation, windResult, precipResult, tempResult, 'winter', relief);
    const n = mesh.numRegions;
    const cycloneExposureAnnual = new Float32Array(n);
    const stormSeverityAnnual = new Float32Array(n);
    const r_weather_hazard = new Uint8Array(n);
    const r_weather_hazard_season = new Int8Array(n);

    for (let r = 0; r < n; r++) {
        cycloneExposureAnnual[r] = Math.max(summer.cycloneExposure[r], winter.cycloneExposure[r]);
        stormSeverityAnnual[r] = Math.max(summer.severity[r], winter.severity[r]);
        const candidates = [
            0,
            cycloneExposureAnnual[r],
            Math.max(summer.severeStorm[r], winter.severeStorm[r]),
            Math.max(summer.tornado[r], winter.tornado[r]) * 1.12,
            Math.max(summer.blizzard[r], winter.blizzard[r]),
            Math.max(summer.extratropical[r], winter.extratropical[r]),
            Math.max(summer.monsoon[r], winter.monsoon[r]),
            Math.max(summer.mountain[r], winter.mountain[r]),
        ];
        let bestId = 0;
        for (let id = 1; id < candidates.length; id++) {
            if (candidates[id] > candidates[bestId]) bestId = id;
        }
        if (candidates[bestId] < 0.18) bestId = 0;
        r_weather_hazard[r] = bestId;

        if (bestId > 0) {
            const summerValue = [0, summer.cycloneExposure[r], summer.severeStorm[r], summer.tornado[r],
                summer.blizzard[r], summer.extratropical[r], summer.monsoon[r], summer.mountain[r]][bestId];
            const winterValue = [0, winter.cycloneExposure[r], winter.severeStorm[r], winter.tornado[r],
                winter.blizzard[r], winter.extratropical[r], winter.monsoon[r], winter.mountain[r]][bestId];
            const contrast = (summerValue - winterValue) / Math.max(0.05, summerValue + winterValue);
            r_weather_hazard_season[r] = contrast > 0.12 ? 1 : (contrast < -0.12 ? -1 : 0);
        }
    }

    return {
        r_weather_hazard,
        r_weather_hazard_season,
        debugLayers: {
            weatherHazard: r_weather_hazard,
            cycloneGenesisSummer: summer.cycloneGenesis,
            cycloneGenesisWinter: winter.cycloneGenesis,
            cycloneExposureAnnual,
            severeStormSummer: summer.severeStorm,
            severeStormWinter: winter.severeStorm,
            tornadoPotentialSummer: summer.tornado,
            tornadoPotentialWinter: winter.tornado,
            blizzardPotentialSummer: summer.blizzard,
            blizzardPotentialWinter: winter.blizzard,
            extratropicalStormSummer: summer.extratropical,
            extratropicalStormWinter: winter.extratropical,
            stormSeveritySummer: summer.severity,
            stormSeverityWinter: winter.severity,
            stormSeverityAnnual,
        },
    };
}
