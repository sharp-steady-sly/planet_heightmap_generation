// Export layer catalog shared by the Generate and Import pages.
// Rendering stays in planet-mesh.js; this module owns user-facing metadata,
// availability, filenames, and the two batch presets.

function layer(id, label, category, options = {}) {
    return Object.freeze({
        id,
        label,
        category,
        filename: options.filename || id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
        requiresClimate: !!options.requiresClimate,
        importSupported: options.importSupported !== false,
        worldbuilding: !!options.worldbuilding,
        inspect: options.inspect !== false,
        unit: options.unit || 'dimensionless',
        description: options.description || '',
    });
}

export const ELEVATION_ENCODING = Object.freeze({
    fullMinKm: -10,
    fullMaxKm: 6,
    bathymetryMinKm: -10,
});

export const EXPORT_LAYER_DEFINITIONS = Object.freeze([
    layer('color', 'Terrain Color', 'Core', {
        filename: 'colormap', worldbuilding: true, inspect: false,
        description: 'Rendered terrain and ocean colors.',
    }),
    layer('biome', 'Satellite', 'Core', {
        filename: 'satellite', requiresClimate: true, worldbuilding: true,
        description: 'Koppen-derived biome colors with elevation shading.',
    }),
    layer('koppen', 'Koppen Climate', 'Core', {
        filename: 'climate', requiresClimate: true, worldbuilding: true,
        unit: 'class', description: 'Categorical Koppen climate classification.',
    }),
    layer('heightmap', 'Full Elevation (Land + Ocean, 16-bit)', 'Elevation', {
        filename: 'full-heightmap', worldbuilding: true, unit: 'metres',
        description: 'Fixed -10 km to +6 km elevation encoding, including bathymetry.',
    }),
    layer('landheightmap', 'Land Elevation (16-bit)', 'Elevation', {
        filename: 'land-heightmap', worldbuilding: true, unit: 'metres',
        description: 'Land elevation from sea level to +6 km; ocean is black.',
    }),
    layer('bathymetry', 'Bathymetry (16-bit)', 'Elevation', {
        filename: 'bathymetry', worldbuilding: true, unit: 'metres',
        description: 'Ocean floor from -10 km to sea level; 65535 is reserved for land.',
    }),
    layer('landmask', 'Land Mask', 'Masks', {
        filename: 'land-mask', worldbuilding: true, inspect: false, unit: 'mask',
        description: 'White land and black ocean.',
    }),
    layer('oceanmask', 'Ocean Mask', 'Masks', {
        filename: 'ocean-mask', worldbuilding: true, inspect: false, unit: 'mask',
        description: 'White ocean and black land.',
    }),
    layer('plates', 'Tectonic Plates', 'Geology', {
        filename: 'plates', worldbuilding: true, inspect: false, unit: 'plate id',
        description: 'Generated or inferred tectonic plate assignments.',
    }),

    layer('pressureSummer', 'Pressure (Summer)', 'Atmosphere', {
        requiresClimate: true, worldbuilding: true, unit: 'hPa deviation from 1013',
    }),
    layer('pressureWinter', 'Pressure (Winter)', 'Atmosphere', {
        requiresClimate: true, worldbuilding: true, unit: 'hPa deviation from 1013',
    }),
    layer('windSpeedSummer', 'Wind Speed + Direction (Summer)', 'Atmosphere', {
        requiresClimate: true, worldbuilding: true, unit: 'relative 0-1',
    }),
    layer('windSpeedWinter', 'Wind Speed + Direction (Winter)', 'Atmosphere', {
        requiresClimate: true, worldbuilding: true, unit: 'relative 0-1',
    }),
    layer('oceanCurrentSummer', 'Ocean Currents (Summer)', 'Ocean', {
        requiresClimate: true, worldbuilding: true, unit: 'relative',
    }),
    layer('oceanCurrentWinter', 'Ocean Currents (Winter)', 'Ocean', {
        requiresClimate: true, worldbuilding: true, unit: 'relative',
    }),
    layer('precipSummer', 'Precipitation (Summer)', 'Climate', {
        requiresClimate: true, worldbuilding: true, unit: 'relative 0-1',
    }),
    layer('precipWinter', 'Precipitation (Winter)', 'Climate', {
        requiresClimate: true, worldbuilding: true, unit: 'relative 0-1',
    }),
    layer('rainShadowSummer', 'Rain Shadow (Summer)', 'Climate', {
        requiresClimate: true, worldbuilding: true, unit: 'signed influence',
    }),
    layer('rainShadowWinter', 'Rain Shadow (Winter)', 'Climate', {
        requiresClimate: true, worldbuilding: true, unit: 'signed influence',
    }),
    layer('tempSummer', 'Temperature (Summer)', 'Climate', {
        requiresClimate: true, worldbuilding: true, unit: 'degrees C',
    }),
    layer('tempWinter', 'Temperature (Winter)', 'Climate', {
        requiresClimate: true, worldbuilding: true, unit: 'degrees C',
    }),
    layer('continentality', 'Continentality', 'Climate', {
        requiresClimate: true, worldbuilding: true, unit: 'relative 0-1',
    }),
    layer('tempContinentality', 'Temperature Continentality', 'Climate', {
        requiresClimate: true, worldbuilding: true, unit: 'climate zone 0-1',
    }),
    layer('erosionDelta', 'Erosion Delta', 'Elevation', {
        filename: 'erosion-delta', worldbuilding: true, unit: 'raw elevation delta',
    }),

    layer('base', 'Base', 'Geology', { importSupported: false }),
    layer('skeleton', 'Skeleton (Pre-noise)', 'Geology', { importSupported: false }),
    layer('tectonic', 'Tectonic', 'Geology', { importSupported: false }),
    layer('noise', 'Noise', 'Geology', { importSupported: false }),
    layer('noiseAmp', 'Noise Amplitude', 'Geology', { importSupported: false }),
    layer('foldBeltWeight', 'Fold Belt Weight', 'Geology', { importSupported: false }),
    layer('cratonWeight', 'Craton Weight', 'Geology', { importSupported: false }),
    layer('basinWeight', 'Basin Weight', 'Geology', { importSupported: false }),
    layer('interior', 'Interior', 'Geology', { importSupported: false }),
    layer('coastal', 'Coastal', 'Geology', { importSupported: false }),
    layer('ocean', 'Ocean Floor', 'Geology', { importSupported: false }),
    layer('hotspot', 'Hotspot', 'Geology', { importSupported: false }),
    layer('tecActivity', 'Tectonic Activity', 'Geology', { importSupported: false }),
    layer('margins', 'Margins', 'Geology', { importSupported: false }),
    layer('backArc', 'Back-Arc', 'Geology', { importSupported: false }),
    layer('phasorRidge', 'Phasor Ridges', 'Geology', { importSupported: false }),
    layer('orogenicPower', 'Orogenic Power', 'Geology', { importSupported: false }),
    layer('lip', 'Flood Basalt (LIP)', 'Geology', { importSupported: false }),
    layer('uniformNoise', 'Uniform Land Noise', 'Geology', { importSupported: false }),
    layer('dynamicTopo', 'Dynamic Topography', 'Geology', { importSupported: false }),

    layer('continentalDrag', 'Continental Drag', 'Plate Physics', { importSupported: false }),
    layer('sizeVelocity', 'Size-Velocity', 'Plate Physics', { importSupported: false }),
    layer('plateSpeed', 'Plate Speed', 'Plate Physics', { importSupported: false }),
    layer('velChange', 'Velocity Change', 'Plate Physics', { importSupported: false }),
    layer('mantleFlow', 'Mantle Flow', 'Plate Physics', { importSupported: false }),
]);

const LAYER_BY_ID = new Map(EXPORT_LAYER_DEFINITIONS.map(def => [def.id, def]));

export function getExportLayerDefinition(id) {
    return LAYER_BY_ID.get(id) || null;
}

export function getExportLayers({ preset = 'all', imported = false } = {}) {
    return EXPORT_LAYER_DEFINITIONS.filter(def => {
        if (imported && !def.importSupported) return false;
        if (preset === 'worldbuilding') return def.worldbuilding;
        return true;
    });
}

export function exportLayerHasData(def, data) {
    if (!def || !data) return false;
    if (!def.importSupported && data.importedHeightmap) return false;

    switch (def.id) {
        case 'color':
        case 'heightmap':
        case 'landheightmap':
        case 'bathymetry':
        case 'landmask':
        case 'oceanmask':
            return !!data.r_elevation;
        case 'plates':
            return !!data.r_plate;
        case 'biome':
        case 'koppen':
            return !!data.debugLayers?.koppen;
        case 'oceanCurrentSummer':
            return !!data.r_ocean_warmth_summer && !!data.r_ocean_speed_summer;
        case 'oceanCurrentWinter':
            return !!data.r_ocean_warmth_winter && !!data.r_ocean_speed_winter;
        default:
            return !!data.debugLayers?.[def.id];
    }
}
