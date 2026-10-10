export const EARTH_RADIUS_KM = 6371;
export const KM_TO_MILES = 0.621371192237334;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function normalizeDirection(value) {
    const x = Number(value?.[0]) || 0;
    const y = Number(value?.[1]) || 0;
    const z = Number(value?.[2]) || 0;
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
}

export function greatCircleDistanceKm(aValue, bValue) {
    const a = normalizeDirection(aValue);
    const b = normalizeDirection(bValue);
    const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
    return Math.acos(dot) * EARTH_RADIUS_KM;
}

export function directionToLatLon(value) {
    const [x, y, z] = normalizeDirection(value);
    return {
        latitude: Math.asin(clamp(y, -1, 1)),
        longitude: Math.atan2(x, z),
    };
}

export function slerpDirection(aValue, bValue, t) {
    const a = normalizeDirection(aValue);
    const b = normalizeDirection(bValue);
    const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);

    if (dot > 0.999999) {
        return normalizeDirection([
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t,
        ]);
    }

    if (dot < -0.999999) {
        const reference = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const orthogonal = normalizeDirection([
            a[1] * reference[2] - a[2] * reference[1],
            a[2] * reference[0] - a[0] * reference[2],
            a[0] * reference[1] - a[1] * reference[0],
        ]);
        const angle = Math.PI * t;
        return [
            a[0] * Math.cos(angle) + orthogonal[0] * Math.sin(angle),
            a[1] * Math.cos(angle) + orthogonal[1] * Math.sin(angle),
            a[2] * Math.cos(angle) + orthogonal[2] * Math.sin(angle),
        ];
    }

    const angle = Math.acos(dot);
    const sinAngle = Math.sin(angle);
    const wa = Math.sin((1 - t) * angle) / sinAngle;
    const wb = Math.sin(t * angle) / sinAngle;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

export function sampleGreatCircle(a, b, count = 96) {
    const samples = [];
    const steps = Math.max(2, Math.round(count));
    for (let i = 0; i <= steps; i++) samples.push(slerpDirection(a, b, i / steps));
    return samples;
}

function wrapPi(angle) {
    let wrapped = angle;
    while (wrapped > Math.PI) wrapped -= Math.PI * 2;
    while (wrapped < -Math.PI) wrapped += Math.PI * 2;
    return wrapped;
}

/** Split a great-circle sample into equirectangular paths without dateline streaks. */
export function projectGreatCircleToMap(a, b, centerLongitude = 0, count = 96) {
    const projected = sampleGreatCircle(a, b, count).map(direction => {
        const { latitude, longitude } = directionToLatLon(direction);
        return { x: wrapPi(longitude - centerLongitude) * (2 / Math.PI), y: latitude * (2 / Math.PI) };
    });

    const segments = [];
    let segment = [projected[0]];
    for (let i = 1; i < projected.length; i++) {
        const previous = projected[i - 1];
        const current = projected[i];
        if (Math.abs(current.x - previous.x) <= 2) {
            segment.push(current);
            continue;
        }

        const crossingRight = previous.x > 0;
        const currentUnwrapped = current.x + (crossingRight ? 4 : -4);
        const boundary = crossingRight ? 2 : -2;
        const t = (boundary - previous.x) / (currentUnwrapped - previous.x);
        const boundaryY = previous.y + (current.y - previous.y) * t;
        segment.push({ x: boundary, y: boundaryY });
        if (segment.length > 1) segments.push(segment);
        segment = [{ x: -boundary, y: boundaryY }, current];
    }
    if (segment.length > 1) segments.push(segment);
    return segments;
}

function roundedDistance(value, increment) {
    return Math.round(value / increment) * increment;
}

export function formatDistance(distanceKm, units = 'both') {
    const kmIncrement = distanceKm >= 100 ? 10 : distanceKm >= 10 ? 1 : 0.1;
    const miles = distanceKm * KM_TO_MILES;
    const mileIncrement = miles >= 100 ? 5 : miles >= 10 ? 1 : 0.1;
    const km = roundedDistance(distanceKm, kmIncrement).toLocaleString(undefined, {
        maximumFractionDigits: kmIncrement < 1 ? 1 : 0,
    });
    const mi = roundedDistance(miles, mileIncrement).toLocaleString(undefined, {
        maximumFractionDigits: mileIncrement < 1 ? 1 : 0,
    });
    if (units === 'km') return [`${km} km`];
    if (units === 'miles') return [`${mi} mi`];
    return [`${km} km`, `${mi} mi`];
}

function sphericalTriangleExcess(a, b, c) {
    const crossX = b[1] * c[2] - b[2] * c[1];
    const crossY = b[2] * c[0] - b[0] * c[2];
    const crossZ = b[0] * c[1] - b[1] * c[0];
    const numerator = a[0] * crossX + a[1] * crossY + a[2] * crossZ;
    const denominator = 1
        + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
        + b[0] * c[0] + b[1] * c[1] + b[2] * c[2]
        + c[0] * a[0] + c[1] * a[1] + c[2] * a[2];
    return 2 * Math.atan2(numerator, denominator);
}

/** Area of the smaller region enclosed by an ordered simple polygon on a sphere. */
export function sphericalPolygonAreaKm2(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 3) return 0;
    const normalized = vertices.map(normalizeDirection);
    let excess = 0;
    for (let i = 1; i < normalized.length - 1; i++) {
        excess += sphericalTriangleExcess(normalized[0], normalized[i], normalized[i + 1]);
    }
    let steradians = Math.abs(excess) % (Math.PI * 4);
    if (steradians > Math.PI * 2) steradians = Math.PI * 4 - steradians;
    return steradians * EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

export function formatArea(areaKm2, units = 'both') {
    const miles2 = areaKm2 * KM_TO_MILES * KM_TO_MILES;
    const format = value => Math.round(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (units === 'km') return [`${format(areaKm2)} km²`];
    if (units === 'miles') return [`${format(miles2)} mi²`];
    return [`${format(areaKm2)} km²`, `${format(miles2)} mi²`];
}
