function safeFilenamePart(value, fallback) {
    const cleaned = String(value ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || fallback;
}

export function currentMapCode(data) {
    const hashCode = typeof location !== 'undefined'
        ? location.hash.replace(/^#/, '').trim()
        : '';
    if (hashCode) return safeFilenamePart(hashCode, 'world');
    if (data?.seed != null) return safeFilenamePart(data.seed, 'world');
    return 'imported-world';
}

export function buildExportFilename(layerName, extension, data) {
    const layer = safeFilenamePart(layerName, 'map');
    const code = currentMapCode(data);
    const ext = safeFilenamePart(extension, 'png').replace(/^\.+/, '');
    return `${layer}_${code}.${ext}`;
}
