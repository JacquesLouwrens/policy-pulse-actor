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
        mode: 'log', // log | immediate | digest | auto | skip
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
            enabled: true,
            maxEntriesPerGroup: 5,
            includeOverflowSummary: true,
            includeConfidenceFooter: true,
        },
    };
}

export function normalizeDeliveryPreferences(preferences = {}) {
    return deepMerge(getDefaultDeliveryPreferences(), preferences);
}

export function mergePreferences(...preferenceLayers) {
    return preferenceLayers.reduce((merged, layer) => {
        if (!layer || !isPlainObject(layer)) return merged;
        return deepMerge(merged, layer);
    }, getDefaultDeliveryPreferences());
}

export async function resolveDeliveryPreferences(deliveryContext = {}) {
    const defaults = getDefaultDeliveryPreferences();

    const inlinePreferences = isPlainObject(deliveryContext.inlinePreferences)
        ? deliveryContext.inlinePreferences
        : {};

    const preferences = mergePreferences(defaults, inlinePreferences);

    return {
        tenantId: deliveryContext?.tenantId || null,
        userId: deliveryContext?.userId || null,
        sources: {
            defaults: true,
            tenant: false,
            user: false,
            inline: Object.keys(inlinePreferences).length > 0,
        },
        preferences,
    };
}

export function evaluateDeliveryPreferences({ url, alertPayload, preferences } = {}) {
    const effective = normalizeDeliveryPreferences(preferences || {});

    const severity = alertPayload?.severity || 'none';
    const riskScore = Number(alertPayload?.riskScore || 0);
    const requiresHumanReview = Boolean(alertPayload?.requiresHumanReview);

    if (effective.mode === 'skip') {
        return {
            route: 'skip',
            reason: 'Delivery mode explicitly set to skip',
            url,
            severity,
            riskScore,
        };
    }

    if (effective.mode === 'log') {
        return {
            route: 'skip',
            reason: 'Log-only mode selected',
            url,
            severity,
            riskScore,
        };
    }

    if (effective.mode === 'immediate') {
        return {
            route: 'immediate',
            reason: 'Delivery mode explicitly set to immediate',
            url,
            severity,
            riskScore,
        };
    }

    if (effective.mode === 'digest') {
        return {
            route: 'digest',
            reason: 'Delivery mode explicitly set to digest',
            url,
            severity,
            riskScore,
        };
    }

    if (effective.mode !== 'auto') {
        return {
            route: 'skip',
            reason: `Unsupported delivery mode "${effective.mode}"`,
            url,
            severity,
            riskScore,
        };
    }

    // AUTO MODE LOGIC
    if (
        severity === 'critical' ||
        severity === 'high' ||
        riskScore >= 70 ||
        requiresHumanReview
    ) {
        return {
            route: 'immediate',
            reason: 'Auto mode selected immediate delivery due to risk/severity',
            url,
            severity,
            riskScore,
        };
    }

    return {
        route: 'digest',
        reason: 'Auto mode selected digest delivery for lower-priority alert',
        url,
        severity,
        riskScore,
    };
}