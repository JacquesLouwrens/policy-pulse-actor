import { Actor } from 'apify';
import { createHash } from 'node:crypto';

export const DEFAULT_DELIVERY_PREFERENCES = {
    minPriorityForImmediate: 'p1',
    minPriorityForDigest: 'p3',
    allowImmediate: true,
    allowDigest: true,
    quietHours: {
        enabled: false,
        startHour: 22,
        endHour: 6,
        timezone: 'UTC',
    },
    deliverDuringQuietHours: {
        p0: true,
        p1: true,
        p2: false,
        p3: false,
        p4: false,
    },
    allowedPolicyTypes: [],
    blockedPolicyTypes: [],
    allowedBusinessImpacts: [],
    blockedDomains: [],
};

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(values) {
    if (!Array.isArray(values)) return [];
    return values
        .map((item) => normalizeString(item))
        .filter(Boolean);
}

function normalizePriority(priority) {
    const valid = ['p0', 'p1', 'p2', 'p3', 'p4'];
    return valid.includes(priority) ? priority : 'p4';
}

function priorityRank(priority) {
    switch (normalizePriority(priority)) {
        case 'p0':
            return 0;
        case 'p1':
            return 1;
        case 'p2':
            return 2;
        case 'p3':
            return 3;
        default:
            return 4;
    }
}

function buildHash(input) {
    return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

function buildTenantKey(tenantId) {
    return `delivery-prefs-tenant-${buildHash(tenantId)}`;
}

function buildUserKey(userId) {
    return `delivery-prefs-user-${buildHash(userId)}`;
}

function mergePreferences(base, override) {
    return {
        ...base,
        ...override,
        quietHours: {
            ...base.quietHours,
            ...(override?.quietHours || {}),
        },
        deliverDuringQuietHours: {
            ...base.deliverDuringQuietHours,
            ...(override?.deliverDuringQuietHours || {}),
        },
        allowedPolicyTypes: normalizeArray(
            override?.allowedPolicyTypes ?? base.allowedPolicyTypes
        ),
        blockedPolicyTypes: normalizeArray(
            override?.blockedPolicyTypes ?? base.blockedPolicyTypes
        ),
        allowedBusinessImpacts: normalizeArray(
            override?.allowedBusinessImpacts ?? base.allowedBusinessImpacts
        ),
        blockedDomains: normalizeArray(
            override?.blockedDomains ?? base.blockedDomains
        ),
        minPriorityForImmediate: normalizePriority(
            override?.minPriorityForImmediate ?? base.minPriorityForImmediate
        ),
        minPriorityForDigest: normalizePriority(
            override?.minPriorityForDigest ?? base.minPriorityForDigest
        ),
    };
}

function extractHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function isWithinQuietHours(preferences, now = new Date()) {
    if (!preferences?.quietHours?.enabled) return false;

    const startHour = Number(preferences.quietHours.startHour);
    const endHour = Number(preferences.quietHours.endHour);
    const currentHour = now.getUTCHours();

    if (Number.isNaN(startHour) || Number.isNaN(endHour)) {
        return false;
    }

    if (startHour === endHour) {
        return true;
    }

    if (startHour < endHour) {
        return currentHour >= startHour && currentHour < endHour;
    }

    return currentHour >= startHour || currentHour < endHour;
}

export async function resolveDeliveryPreferences({
    tenantId = null,
    userId = null,
    inlinePreferences = null,
} = {}) {
    let effective = { ...DEFAULT_DELIVERY_PREFERENCES };
    const sources = ['defaults'];

    if (tenantId) {
        const tenantPrefs =
            (await Actor.getValue(buildTenantKey(tenantId))) || null;

        if (tenantPrefs) {
            effective = mergePreferences(effective, tenantPrefs);
            sources.push('tenant');
        }
    }

    if (userId) {
        const userPrefs =
            (await Actor.getValue(buildUserKey(userId))) || null;

        if (userPrefs) {
            effective = mergePreferences(effective, userPrefs);
            sources.push('user');
        }
    }

    if (inlinePreferences && typeof inlinePreferences === 'object') {
        effective = mergePreferences(effective, inlinePreferences);
        sources.push('inline');
    }

    return {
        tenantId,
        userId,
        sources,
        preferences: effective,
    };
}

export function evaluateDeliveryPreferences({
    url,
    alertPayload,
    preferences,
    now = new Date(),
} = {}) {
    const resolvedPrefs = preferences || DEFAULT_DELIVERY_PREFERENCES;
    const priority = normalizePriority(alertPayload?.priority);
    const primaryType = normalizeString(alertPayload?.primaryType);
    const businessImpact = normalizeString(alertPayload?.businessImpact).toLowerCase();
    const hostname = extractHostname(url || alertPayload?.url);

    if (!alertPayload) {
        return {
            route: 'skip',
            reason: 'No alert payload available',
        };
    }

    if (
        resolvedPrefs.blockedDomains.includes(hostname)
    ) {
        return {
            route: 'skip',
            reason: `Blocked domain: ${hostname}`,
        };
    }

    if (
        resolvedPrefs.allowedPolicyTypes.length > 0 &&
        !resolvedPrefs.allowedPolicyTypes.includes(primaryType)
    ) {
        return {
            route: 'skip',
            reason: `Policy type not in allow-list: ${primaryType || 'Unknown'}`,
        };
    }

    if (
        resolvedPrefs.blockedPolicyTypes.includes(primaryType)
    ) {
        return {
            route: 'skip',
            reason: `Blocked policy type: ${primaryType || 'Unknown'}`,
        };
    }

    if (
        resolvedPrefs.allowedBusinessImpacts.length > 0 &&
        !resolvedPrefs.allowedBusinessImpacts.includes(businessImpact)
    ) {
        return {
            route: 'skip',
            reason: `Business impact not in allow-list: ${businessImpact || 'unknown'}`,
        };
    }

    const quietHoursActive = isWithinQuietHours(resolvedPrefs, now);

    if (
        quietHoursActive &&
        !resolvedPrefs.deliverDuringQuietHours[priority]
    ) {
        if (
            resolvedPrefs.allowDigest &&
            priorityRank(priority) <= priorityRank(resolvedPrefs.minPriorityForDigest)
        ) {
            return {
                route: 'digest',
                reason: `Quiet hours active; downgraded to digest for ${priority.toUpperCase()}`,
                quietHoursActive: true,
            };
        }

        return {
            route: 'skip',
            reason: `Quiet hours active; ${priority.toUpperCase()} not allowed`,
            quietHoursActive: true,
        };
    }

    if (
        resolvedPrefs.allowImmediate &&
        priorityRank(priority) <= priorityRank(resolvedPrefs.minPriorityForImmediate)
    ) {
        return {
            route: 'immediate',
            reason: `Priority ${priority.toUpperCase()} meets immediate threshold`,
            quietHoursActive,
        };
    }

    if (
        resolvedPrefs.allowDigest &&
        priorityRank(priority) <= priorityRank(resolvedPrefs.minPriorityForDigest)
    ) {
        return {
            route: 'digest',
            reason: `Priority ${priority.toUpperCase()} meets digest threshold`,
            quietHoursActive,
        };
    }

    return {
        route: 'skip',
        reason: `Priority ${priority.toUpperCase()} did not meet delivery thresholds`,
        quietHoursActive,
    };
}