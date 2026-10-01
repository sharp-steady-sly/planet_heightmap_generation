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
    layer('surfaceLithology', 'Surface Lithology', 'Regional Geology', {
        filename: 'surface-lithology', worldbuilding: true, importSupported: false, unit: 'class',
        description: 'Broad inferred surface rock and sediment units.',
    }),
    layer('basementAge', 'Basement Age', 'Regional Geology', {
        filename: 'basement-age', worldbuilding: true, importSupported: false, unit: 'Ma',
        description: 'Approximate crustal basement age, including oceanic spreading age.',
    }),
    layer('surfaceAge', 'Surface Unit Age', 'Regional Geology', {
        filename: 'surface-unit-age', worldbuilding: true, importSupported: false, unit: 'Ma',
        description: 'Approximate age of the mapped surface unit.',
    }),
    layer('intrusiveBodies', 'Intrusive Bodies', 'Regional Geology', {
        filename: 'intrusive-bodies', worldbuilding: true, importSupported: false, unit: 'favorability 0-1',
        description: 'Inferred intrusive systems colored by broad magma affinity.',
    }),
    layer('metamorphicGrade', 'Metamorphic Grade', 'Regional Geology', {
        filename: 'metamorphic-grade', worldbuilding: true, importSupported: false, unit: 'relative 0-1',
        description: 'Regional metamorphic intensity inferred from stress, burial, and intrusion.',
    }),
    layer('sedimentThickness', 'Sediment Thickness', 'Regional Geology', {
        filename: 'sediment-thickness', worldbuilding: true, importSupported: false, unit: 'km',
        description: 'Approximate regional sediment thickness in basins and ocean crust.',
    }),

    layer('metalProvince', 'Dominant Metal Province', 'Metal Potential', {
        filename: 'metal-provinces', worldbuilding: true, importSupported: false, unit: 'class',
        description: 'Strongest inferred metallogenic setting above the display threshold.',
    }),
    layer('metalArc', 'Arc / Felsic Hydrothermal Potential', 'Metal Potential', {
        filename: 'metal-arc-hydrothermal', worldbuilding: true, importSupported: false, unit: 'favorability 0-1',
        description: 'Regional copper, gold, silver, molybdenum, and tin favorability around active arcs and felsic intrusions.',
    }),
    layer('metalOrogenic', 'Orogenic Vein Potential', 'Metal Potential', {
        filename: 'metal-orogenic-gold', worldbuilding: true, importSupported: false, unit: 'favorability 0-1',
        description: 'Regional gold, silver, tungsten, and antimony favorability in stressed and metamorphosed fold belts.',
    }),
    layer('metalVms', 'VMS / Base Metal Potential', 'Metal Potential', {
        filename: 'metal-vms-base-metals', worldbuilding: true, importSupported: false, unit: 'favorability 0-1',
        description: 'Regional copper, zinc, lead, silver, and gold favorability in ridges, back-arcs, and volcanic belts.',
    }),
    layer('metalMafic', 'Mafic Magmatic Potential', 'Metal Potential', {
        filename: 'metal-mafic-magmatic', worldbuilding: true, importSupported: false, unit: 'favorability 0-1',
        description: 'Regional iron, nickel, cobalt, chromium, vanadium, and platinum favorability in mafic and hotspot systems.',
    }),
    layer('metalCraton', 'Craton-Related Potential', 'Metal Potential', {
        filename: 'metal-craton-related', worldbuilding: true, importSupported: false, unit: 'favorability 0-1',
        description: 'Ancient-craton favorability for iron, gold, uranium, and diamond-bearing settings.',
    }),
    layer('metalSedimentary', 'Sedimentary / Residual Potential', 'Metal Potential', {
        filename: 'metal-sedimentary', worldbuilding: true, importSupported: false, unit: 'favorability 0-1',
        description: 'Regional iron, manganese, aluminum, copper, lead, zinc, and uranium favorability in basins and residual deposits.',
    }),
    layer('metalPlacer', 'Placer Metal Potential', 'Metal Potential', {
        filename: 'metal-placer', worldbuilding: true, importSupported: false, requiresClimate: true, unit: 'favorability 0-1',
        description: 'Gold, tin, platinum, and titanium concentration potential routed downstream from eroding source provinces.',
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

    layer('flowAccumulationAnnual', 'Flow Accumulation (Annual)', 'Hydrology', {
        requiresClimate: true, worldbuilding: true, unit: 'log-normalized relative runoff',
        description: 'Annual precipitation-weighted runoff accumulated through the drainage network.',
    }),
    layer('flowAccumulationSummer', 'Flow Accumulation (Summer)', 'Hydrology', {
        requiresClimate: true, worldbuilding: true, unit: 'log-normalized relative runoff',
        description: 'Summer precipitation accumulated through the drainage network.',
    }),
    layer('flowAccumulationWinter', 'Flow Accumulation (Winter)', 'Hydrology', {
        requiresClimate: true, worldbuilding: true, unit: 'log-normalized relative runoff',
        description: 'Winter precipitation accumulated through the drainage network.',
    }),
    layer('riversAnnual', 'River Network (Annual)', 'Hydrology', {
        filename: 'river-network-annual', requiresClimate: true, worldbuilding: true,
        unit: 'relative river strength',
        description: 'Major drainage paths selected from annual accumulated runoff.',
    }),
    layer('riverSeasonality', 'River Seasonality', 'Hydrology', {
        requiresClimate: true, worldbuilding: true, unit: 'winter -1 to summer +1',
        description: 'Seasonal dominance along major drainage paths.',
    }),
    layer('lakeDepth', 'Lake Candidates', 'Hydrology', {
        filename: 'lake-candidates', requiresClimate: true, worldbuilding: true,
        unit: 'potential depth, normalized at 1 km',
        description: 'Depressions deeper than 25 metres on the conditioned drainage surface.',
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
