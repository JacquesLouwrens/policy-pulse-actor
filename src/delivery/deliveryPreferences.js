import { Actor } from 'apify';
import { createHash } from 'node:crypto';

export const DEFAULT_DELIVERY_PREFERENCES = {
    channels: ['slack'],
    emailTo: null,
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
        channels: Array.isArray(override?.channels)
            ? [...new Set(
                override.channels
                    .map((item) => normalizeString(item).toLowerCase())
                    .filter(Boolean)
              )]
            : base.channels,
        emailTo: normalizeString(override?.emailTo ?? base.emailTo) || null,
        quietHours: {
            ...base.quietHours,
            ...(override?.quietHours || {}),
        },
        deliverDuringQuietHours: {
           