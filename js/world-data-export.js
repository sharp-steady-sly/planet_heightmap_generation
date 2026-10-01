// Machine-readable export for worldbuilding and downstream GIS-style analysis.

import { state } from './state.js';
import { elevToHeightKm } from './color-map.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { ELEVATION_ENCODING, EXPORT_LAYER_DEFINITIONS, exportLayerHasData } from './export-layers.js';
import { LITHOLOGY_CLASSES, INTRUSIVE_TYPES, METAL_PROVINCES } from './geology.js';

const RAD_TO_DEG = 180 / Math.PI;

function finite(value, digits = 6) {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : '';
}

function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizedTempToC(value) {
    return Number.isFinite(value) ? -45 + Math.max(0, Math.min(1, value)) * 90 : NaN;
}

function bearingDegrees(east, north) {
    if (!Number.isFinite(east) || !Number.isFinite(north)) return NaN;
    if (Math.abs(east) + Math.abs(north) < 1e-12) return NaN;
    return (Math.atan2(east, north) * RAD_TO_DEG + 360) % 360;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportCode() {
    return location.hash.replace(/^#/, '').trim() || String(state.curData?.seed ?? 'world');
}

export async function exportWorldData(onProgress) {
    const data = state.curData;
    if (!data) throw new Error('Generate or import a world before exporting data.');

    const { mesh, r_xyz, r_elevation, r_plate, plateIsOcean, debugLayers = {} } = data;
    const n = mesh.numRegions;
    const headers = [
        'region_id', 'latitude_deg', 'longitude_deg', 'elevation_m', 'surface',
        'plate_id', 'plate_crust', 'koppen_id', 'koppen_code', 'koppen_name',
        'surface_lithology_id', 'surface_lithology_code', 'surface_lithology_name',
        'basement_age_ma', 'surface_unit_age_ma',
        'intrusive_type_id', 'intrusive_type_code', 'intrusive_type_name', 'intrusive_common_metals', 'intrusive_strength',
        'metamorphic_grade', 'sediment_thickness_km',
        'metal_province_id', 'metal_province_code', 'metal_province_name',
        'metal_province_common_metals', 'metal_province_other_resources',
        'metal_arc_hydrothermal_potential', 'metal_orogenic_gold_potential',
        'metal_vms_base_metals_potential', 'metal_mafic_magmatic_potential',
        'metal_craton_related_potential', 'metal_sedimentary_potential', 'metal_placer_potential',
        'temperature_summer_c', 'temperature_winter_c',
        'precipitation_summer_relative', 'precipitation_winter_relative',
        'precipitation_summer_approx_mm', 'precipitation_winter_approx_mm',
        'pressure_summer_hpa', 'pressure_winter_hpa',
        'wind_east_summer', 'wind_north_summer', 'wind_speed_summer_relative', 'wind_bearing_summer_deg',
        'wind_east_winter', 'wind_north_winter', 'wind_speed_winter_relative', 'wind_bearing_winter_deg',
        'ocean_current_east_summer', 'ocean_current_north_summer',
        'ocean_current_speed_summer_relative', 'ocean_current_warmth_summer', 'ocean_current_bearing_summer_deg',
        'ocean_current_east_winter', 'ocean_current_north_winter',
        'ocean_current_speed_winter_relative', 'ocean_current_warmth_winter', 'ocean_current_bearing_winter_deg',
        'rain_shadow_summer', 'rain_shadow_winter', 'continentality', 'temperature_continentality',
        'downstream_region_id', 'catchment_cells',
        'flow_accumulation_summer_relative', 'flow_accumulation_winter_relative',
        'flow_accumulation_annual_relative', 'river_strength', 'river_seasonality',
        'lake_candidate_id', 'lake_candidate_depth_m',
        'erosion_delta_raw', 'erosion_delta_approx_m',
    ];

    const chunks = [headers.join(',') + '\r\n'];
    let chunk = '';
    for (let r = 0; r < n; r++) {
        const x = r_xyz[r * 3];
        const y = r_xyz[r * 3 + 1];
        const z = r_xyz[r * 3 + 2];
        const elevation = r_elevation[r];
        const plate = r_plate?.[r];
        const koppenId = debugLayers.koppen?.[r];
        const koppen = Number.isInteger(koppenId) ? KOPPEN_CLASSES[koppenId] : null;
        const lithologyId = data.r_surface_lithology?.[r];
        const lithology = Number.isInteger(lithologyId) ? LITHOLOGY_CLASSES[lithologyId] : null;
        const intrusiveTypeId = data.r_intrusive_type?.[r];
        const intrusiveType = Number.isInteger(intrusiveTypeId) ? INTRUSIVE_TYPES[intrusiveTypeId] : null;
        const metalProvinceId = data.r_metal_province?.[r];
        const metalProvince = Number.isInteger(metalProvinceId) ? METAL_PROVINCES[metalProvinceId] : null;
        const tempSummer = debugLayers.tempSummer?.[r] ?? data.r_temperature_summer?.[r];
        const tempWinter = debugLayers.tempWinter?.[r] ?? data.r_temperature_winter?.[r];
        const precipSummer = debugLayers.precipSummer?.[r] ?? data.r_precip_summer?.[r];
        const precipWinter = debugLayers.precipWinter?.[r] ?? data.r_precip_winter?.[r];
        const windES = data.r_wind_east_summer?.[r];
        const windNS = data.r_wind_north_summer?.[r];
        const windEW = data.r_wind_east_winter?.[r];
        const windNW = data.r_wind_north_winter?.[r];
        const oceanES = data.r_ocean_current_east_summer?.[r];
        const oceanNS = data.r_ocean_current_north_summer?.[r];
        const oceanEW = data.r_ocean_current_east_winter?.[r];
        const oceanNW = data.r_ocean_current_north_winter?.[r];
        const erosionDelta = debugLayers.erosionDelta?.[r];
        const erosionMeters = Number.isFinite(erosionDelta)
            ? (elevToHeightKm(elevation) - elevToHeightKm(elevation - erosionDelta)) * 1000
            : NaN;

        const values = [
            r,
            finite(Math.asin(Math.max(-1, Math.min(1, y))) * RAD_TO_DEG),
            finite(Math.atan2(x, z) * RAD_TO_DEG),
            finite(elevToHeightKm(elevation) * 1000, 2),
            elevation > 0 ? 'land' : 'ocean',
            Number.isFinite(plate) ? plate : '',
            Number.isFinite(plate) && plateIsOcean
                ? (plateIsOcean.has(plate) ? 'oceanic' : 'continental')
                : '',
            Number.isFinite(koppenId) ? koppenId : '',
            koppen?.code || '',
            koppen?.name || '',
            Number.isFinite(lithologyId) ? lithologyId : '',
            lithology?.code || '',
            lithology?.name || '',
            finite(data.r_basement_age_ma?.[r], 1),
            finite(data.r_surface_age_ma?.[r], 1),
            Number.isFinite(intrusiveTypeId) ? intrusiveTypeId : '',
            intrusiveType?.code || '',
            intrusiveType?.name || '',
            intrusiveType?.metals?.join('; ') || '',
            finite(data.r_intrusive_strength?.[r]),
            finite(data.r_metamorphic_grade?.[r]),
            finite(data.r_sediment_thickness_km?.[r], 3),
            Number.isFinite(metalProvinceId) ? metalProvinceId : '',
            metalProvince?.code || '',
            metalProvince?.name || '',
            metalProvince?.metals?.join('; ') || '',
            metalProvince?.otherResources?.join('; ') || '',
            finite(data.r_metal_arc?.[r]),
            finite(data.r_metal_orogenic?.[r]),
            finite(data.r_metal_vms?.[r]),
            finite(data.r_metal_mafic?.[r]),
            finite(data.r_metal_craton?.[r]),
            finite(data.r_metal_sedimentary?.[r]),
            finite(data.r_metal_placer?.[r]),
            finite(normalizedTempToC(tempSummer), 2),
            finite(normalizedTempToC(tempWinter), 2),
            finite(precipSummer), finite(precipWinter),
            finite(Number.isFinite(precipSummer) ? Math.max(0, Math.min(1, precipSummer)) * 1000 : NaN, 1),
            finite(Number.isFinite(precipWinter) ? Math.max(0, Math.min(1, precipWinter)) * 1000 : NaN, 1),
            finite(Number.isFinite(debugLayers.pressureSummer?.[r]) ? 1013 + debugLayers.pressureSummer[r] : NaN, 2),
            finite(Number.isFinite(debugLayers.pressureWinter?.[r]) ? 1013 + debugLayers.pressureWinter[r] : NaN, 2),
            finite(windES), finite(windNS), finite(debugLayers.windSpeedSummer?.[r]), finite(bearingDegrees(windES, windNS), 2),
            finite(windEW), finite(windNW), finite(debugLayers.windSpeedWinter?.[r]), finite(bearingDegrees(windEW, windNW), 2),
            finite(oceanES), finite(oceanNS), finite(data.r_ocean_speed_summer?.[r]), finite(data.r_ocean_warmth_summer?.[r]),
            finite(bearingDegrees(oceanES, oceanNS), 2),
            finite(oceanEW), finite(oceanNW), finite(data.r_ocean_speed_winter?.[r]), finite(data.r_ocean_warmth_winter?.[r]),
            finite(bearingDegrees(oceanEW, oceanNW), 2),
            finite(debugLayers.rainShadowSummer?.[r]), finite(debugLayers.rainShadowWinter?.[r]),
            finite(debugLayers.continentality?.[r]), finite(debugLayers.tempContinentality?.[r]),
            Number.isInteger(data.r_flow_receiver?.[r]) && data.r_flow_receiver[r] >= 0
                ? data.r_flow_receiver[r] : '',
            finite(data.r_catchment_cells?.[r], 0),
            finite(data.r_flow_accumulation_summer?.[r]),
            finite(data.r_flow_accumulation_winter?.[r]),
            finite(data.r_flow_accumulation_annual?.[r]),
            finite(data.r_river_strength?.[r]), finite(data.r_river_seasonality?.[r]),
            Number.isInteger(data.r_lake_id?.[r]) && data.r_lake_id[r] >= 0
                ? data.r_lake_id[r] : '',
            finite(Number.isFinite(data.r_lake_depth_km?.[r]) ? data.r_lake_depth_km[r] * 1000 : NaN, 2),
            finite(erosionDelta), finite(erosionMeters, 2),
        ];
        chunk += values.map(csvCell).join(',') + '\r\n';

        if ((r + 1) % 5000 === 0) {
            chunks.push(chunk);
            chunk = '';
            onProgress?.((r + 1) / n * 80, `Writing world data (${r + 1}/${n})...`);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    if (chunk) chunks.push(chunk);

    const code = exportCode();
    onProgress?.(85, 'Preparing CSV...');
    downloadBlob(new Blob(chunks, { type: 'text/csv;charset=utf-8' }), `orogen-world-data-${code}.csv`);

    const metadata = {
        schemaVersion: 4,
        generator: 'World Orogen',
        exportedAt: new Date().toISOString(),
        planetCode: code,
        seed: data.seed ?? null,
        importedHeightmap: !!state.importedHeightmap,
        regionCount: n,
        coordinates: {
            projection: 'geographic latitude/longitude',
            latitude: 'degrees north, range -90..90',
            longitude: 'degrees east, range -180..180',
        },
        rasterEncodings: {
            fullHeightmap16Bit: `elevation_m = (pixel / 65535 * ${(ELEVATION_ENCODING.fullMaxKm - ELEVATION_ENCODING.fullMinKm) * 1000}) + (${ELEVATION_ENCODING.fullMinKm * 1000})`,
            landHeightmap16Bit: 'land_elevation_m = pixel / 65535 * 6000; ocean pixels are 0',
            bathymetry16Bit: `ocean_elevation_m = (pixel / 65534 * ${-ELEVATION_ENCODING.bathymetryMinKm * 1000}) + (${ELEVATION_ENCODING.bathymetryMinKm * 1000}); 65535 means land/no-data`,
            masks: '8-bit PNG; white is included area, black is excluded area',
        },
        dataNotes: {
            precipitation: 'Relative simulation intensity. Approximate millimetres are relative value x 1000 and are not calibrated observations.',
            windAndCurrents: 'Vector components and speed are relative simulation values, not metres per second.',
            pressure: 'Pressure layers store deviation from 1013 hPa; CSV values add that baseline.',
            temperature: 'Normalized simulation temperature converted linearly from 0..1 to -45..45 C.',
            seasons: 'Summer and winter are northern-hemisphere seasons; local warm/cold seasons reverse in the southern hemisphere.',
            hydrology: 'Flow accumulation is relative precipitation-weighted runoff on a depression-conditioned drainage graph. Lake candidates are terrain depressions at least 25 m below their spill surface; neither product includes calibrated evaporation, infiltration, dams, or channel hydraulics.',
            geology: 'Lithology, ages, intrusions, metamorphism, and sediment thickness are deterministic regional inferences from generated tectonic settings. They are not a stratigraphic or geodynamic forward model.',
            metals: 'Metal values are relative favorability for broad deposit-forming environments, not deposits, reserves, grades, or guarantees. Placer favorability routes eroding source potential through the generated drainage network.',
            geometry: 'Rows represent irregular spherical mesh regions, not raster pixels.',
        },
        classificationCatalogs: {
            surfaceLithology: LITHOLOGY_CLASSES.map(({ code, name, color }) => ({ code, name, color })),
            intrusiveTypes: INTRUSIVE_TYPES.map(({ code, name, color, metals }) => ({ code, name, color, metals })),
            metalProvinces: METAL_PROVINCES.map(({ code, name, color, metals, otherResources }) => ({
                code, name, color, metals, otherResources: otherResources || [],
            })),
        },
        availableRasterLayers: EXPORT_LAYER_DEFINITIONS
            .filter(def => (!state.importedHeightmap || def.importSupported) && exportLayerHasData(def, data))
            .map(def => ({ id: def.id, label: def.label, filename: def.filename, unit: def.unit, description: def.description })),
        csvColumns: headers,
    };

    onProgress?.(95, 'Preparing metadata...');
    downloadBlob(
        new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json;charset=utf-8' }),
        `orogen-world-metadata-${code}.json`,
    );
    onProgress?.(100, 'World data exported');
}
