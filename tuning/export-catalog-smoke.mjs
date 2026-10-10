import assert from 'node:assert/strict';
import { buildExportFilename, currentMapCode } from '../js/export-filenames.js';
import { getExportLayers } from '../js/export-layers.js';

globalThis.location = { hash: '#07xiox3ru8bz9050natw8s' };

assert.equal(currentMapCode({ seed: 123 }), '07xiox3ru8bz9050natw8s');
assert.equal(
    buildExportFilename('storm-severity-annual', 'png', { seed: 123 }),
    'storm-severity-annual_07xiox3ru8bz9050natw8s.png',
);

location.hash = '';
assert.equal(buildExportFilename('world-data', 'csv', { seed: 123 }), 'world-data_123.csv');
assert.equal(buildExportFilename('preview', 'png', {}), 'preview_imported-world.png');

const atlasIds = new Set(getExportLayers({ preset: 'worldbuilding' }).map(def => def.id));
for (const id of [
    'weatherHazard',
    'cycloneExposureAnnual',
    'stormSeveritySummer',
    'stormSeverityWinter',
    'stormSeverityAnnual',
]) {
    assert(atlasIds.has(id), `${id} should be included in the worldbuilding atlas`);
}

for (const id of [
    'cycloneGenesisSummer',
    'severeStormSummer',
    'tornadoPotentialSummer',
    'blizzardPotentialSummer',
    'extratropicalStormSummer',
]) {
    assert(!atlasIds.has(id), `${id} should remain exclusive to All Map Types`);
}

console.log('export-catalog smoke: filenames and curated weather atlas passed');
