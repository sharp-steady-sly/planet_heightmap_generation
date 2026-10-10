import assert from 'node:assert/strict';
import { computeWeatherHazards, WEATHER_HAZARD_CLASSES } from '../js/weather-hazards.js';

const mesh = {
    numRegions: 6,
    adjOffset: new Int32Array([0, 2, 4, 6, 8, 10, 12]),
    adjList: new Int32Array([1, 5, 0, 2, 1, 3, 2, 4, 3, 5, 4, 0]),
};
const xyz = new Float32Array([
    0, 0.259, 0.966, 0.837, 0.259, 0.483, 0.837, 0.259, -0.483,
    0, 0.259, -0.966, -0.837, 0.259, -0.483, -0.837, 0.259, 0.483,
]);
const elevation = new Float32Array([-0.1, -0.1, -0.1, 0.1, 0.1, 0.1]);
const constant = value => new Float32Array(6).fill(value);
const wind = {
    r_wind_east_summer: constant(0.5), r_wind_north_summer: constant(0.1),
    r_wind_east_winter: constant(-0.4), r_wind_north_winter: constant(0.1),
    r_wind_speed_summer: constant(0.7), r_wind_speed_winter: constant(0.7),
    r_pressure_summer: constant(-8), r_pressure_winter: constant(-5),
    r_continentality: new Float32Array([0, 0, 0, 0.2, 0.5, 0.8]),
};
const precip = { r_precip_summer: constant(0.8), r_precip_winter: constant(0.45) };
const temp = { r_temperature_summer: constant((29 + 45) / 90), r_temperature_winter: constant((8 + 45) / 90) };

const result = computeWeatherHazards(mesh, xyz, elevation, wind, {}, precip, temp);
assert.equal(WEATHER_HAZARD_CLASSES.length, 8);
assert.equal(result.r_weather_hazard.length, mesh.numRegions);
assert.equal(result.debugLayers.stormSeverityAnnual.length, mesh.numRegions);
for (const field of Object.values(result.debugLayers)) {
    for (const value of field) assert.ok(Number.isFinite(value));
}
assert.ok(result.debugLayers.cycloneGenesisSummer[1] > 0);
assert.ok(result.debugLayers.severeStormSummer[4] > 0);
console.log('weather-hazards smoke: seasonal hazard fields and dominant classes passed');
