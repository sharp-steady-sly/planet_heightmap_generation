import assert from 'node:assert/strict';
import {
    EARTH_RADIUS_KM,
    formatArea,
    formatDistance,
    greatCircleDistanceKm,
    projectGreatCircleToMap,
    sphericalPolygonAreaKm2,
} from '../js/distance-utils.js';

const north = [0, 1, 0];
const equator = [0, 0, 1];
const quarter = greatCircleDistanceKm(north, equator);
assert.ok(Math.abs(quarter - Math.PI * EARTH_RADIUS_KM / 2) < 1e-6);

const datelineA = [Math.sin(179 * Math.PI / 180), 0, Math.cos(179 * Math.PI / 180)];
const datelineB = [Math.sin(-179 * Math.PI / 180), 0, Math.cos(-179 * Math.PI / 180)];
const segments = projectGreatCircleToMap(datelineA, datelineB, 0, 24);
assert.equal(segments.length, 2, 'dateline crossing should split into two map paths');
for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
        assert.ok(Math.abs(segment[i].x - segment[i - 1].x) <= 2);
    }
}

assert.deepEqual(formatDistance(1345, 'both'), ['1,350 km', '835 mi']);
assert.deepEqual(formatDistance(100, 'km'), ['100 km']);

const octantArea = sphericalPolygonAreaKm2([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
assert.ok(Math.abs(octantArea - Math.PI * EARTH_RADIUS_KM ** 2 / 2) < 1e-6);
assert.deepEqual(formatArea(1000000, 'both'), ['1,000,000 km²', '386,102 mi²']);
console.log('distance-ruler smoke: distance, spherical area, dateline split, and units passed');
