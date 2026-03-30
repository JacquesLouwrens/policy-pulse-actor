function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
    if (!isPlainObject(base)) return override;
    if (!isPlainObject(override)) return override ?? base;

    const result = { ...base };

    for (const [key, value] of Object.entries(override)) {
        if (value === undefined) continue;

        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = deepMerge(result[key], value);
        } else {
            result[key] = value;
        }
    }

    return result;
}

export function getDefaultDeliveryPreferences() {
    return {
        mode: 'log',
        channels: {
            slack: {
                enabled: true,
                channel: null,
            },
            email: {
                enabled: false,
                to: [],
                subjectPrefix: '[Policy Pulse]',
            },
        },
        digest: {
            maxEntriesPerGroup: 5,
            includeOverflowSummary: true,
            includeConfidenceFooter: true,
        },
    };
}

export function normalizeDeliveryPreferences(preferences = {}) {
    const defaults = getDefaultDeliveryPreferences();
    return deepMerge(defaults, preferences);
}

export function mergePreferences(...preferenceLayers) {
    const defaults = getDefaultDeliveryPreferences();

    return preferenceLayers.reduce((merged, layer) => {
        if (!layer || !isPlainObject(layer)) return merged;
        return deepMerge(merged, layer);
    }, defaults);
}