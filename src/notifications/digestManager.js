import { Actor } from 'apify';
import { createHash } from 'node:crypto';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
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

function buildDigestQueueKey(channel) {
    return `digest-queue-${buildHash(channel || 'policy-digests')}`;
}

function buildItemFingerprint(url, alertPayload = {}) {
    const source = {
        url: normalizeString(url),
        headline: normalizeString(alertPayload.headline),
        priority: normalizePriority(alertPayload.priority),
        primaryType: normalizeString(alertPayload.primaryType),
        businessImpact: normalizeString(alertPayload.businessImpact),
        recommendedAction: normalizeString(alertPayload.recommendedAction),
        topDrivers: Array.isArray(alertPayload.topDrivers)
            ? alertPayload.topDrivers.slice(0, 5).map((item) => normalizeString(item))
            : [],
    };

    return createHash('sha256')
        .update(JSON.stringify(source))
        .digest('hex');
}

function highestPriority(items = []) {
    if (!items.length) return 'p4';

    return items
        .map((item) => normalizePriority(item.priority))
        .sort((a, b) => priorityRank(a) - priorityRank(b))[0];
}

function summarizeCounts(items = []) {
    const summary = {
        p0: 0,
        p1: 0,
        p2: 0,
        p3: 0,
        p4: 0,
    };

    for (const item of items) {
        summary[normalizePriority(item.priority)] += 1;
    }

    return summary;
}

function groupEntriesByPolicyType(items = []) {
    const groupsMap = new Map();

    for (const item of items) {
        const primaryType = normalizeString(item.primaryType) || 'Unknown';

        if (!groupsMap.has(primaryType)) {
            groupsMap.set(primaryType, []);
        }

        groupsMap.get(primaryType).push(item);
    }

    const groups = Array.from(groupsMap.entries()).map(([primaryType, entries]) => {
        const sortedEntries = [...entries].sort((a, b) => {
            const priorityCompare = priorityRank(a.priority) - priorityRank(b.priority);
            if (priorityCompare !== 0) return priorityCompare;

            const aTime = new Date(a.queuedAt || 0).getTime();
            const bTime = new Date(b.queuedAt || 0).getTime();
            return aTime - bTime;
        });

        return {
            primaryType,
            itemCount: sortedEntries.length,
            highestPriority: highestPriority(sortedEntries),
            summary: summarizeCounts(sortedEntries),
            entries: sortedEntries,
        };
    });

    return groups.sort((a, b) => {
        const priorityCompare = priorityRank(a.highestPriority) - priorityRank(b.highestPriority);
        if (priorityCompare !== 0) return priorityCompare;

        return b.itemCount - a.itemCount;
    });
}

function buildDigestPayload({
    channel,
    items,
    trigger,
    windowMinutes,
    maxItems,
}) {
    const counts = summarizeCounts(items);
    const highest = highestPriority(items);
    const groups = groupEntriesByPolicyType(items);

    return {
        channel,
        mode: 'digest',
        headline: `Policy Pulse Digest — ${items.length} queued alerts`,
        trigger,
        itemCount: items.length,
        highestPriority: highest,
        summary: {
            p0: counts.p0,
            p1: counts.p1,
            p2: counts.p2,
            p3: counts.p3,
            p4: counts.p4,
            windowMinutes,
            maxItems,
        },
        groupedEntries: groups,
        entries: items.map((item) => ({
            url: item.url,
            headline: item.headline,
            priority: item.priority,
            severity: item.severity,
            businessImpact: item.businessImpact,
            primaryType: item.primaryType,
            reviewWindow: item.reviewWindow,
            requiresHumanReview: Boolean(item.requiresHumanReview),
            recommendedAction: item.recommendedAction,
            topDrivers: Array.isArray(item.topDrivers) ? item.topDrivers.slice(0, 3) : [],
            queuedAt: item.queuedAt,
        })),
        createdAt: new Date().toISOString(),
    };
}

export function shouldUseImmediateDelivery(alertPayload = {}) {
    const priority = normalizePriority(alertPayload.priority);

    return (
        priority === 'p0' ||
        priority === 'p1' ||
        Boolean(alertPayload.requiresHumanReview)
    );
}

export function shouldQueueForDigest(alertPayload = {}) {
    const priority = normalizePriority(alertPayload.priority);
    return priority === 'p2' || priority === 'p3';
}

export async function queueDigestAlert({
    url,
    alertPayload,
    channel = 'policy-digests',
    windowMinutes = 180,
    maxItems = 5,
}) {
    const safeWindowMinutes = clamp(Number(windowMinutes) || 180, 15, 60 * 24);
    const safeMaxItems = clamp(Number(maxItems) || 5, 2, 100);
    const queueKey = buildDigestQueueKey(channel);
    const fingerprint = buildItemFingerprint(url, alertPayload);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const existing = (await Actor.getValue(queueKey)) || {
        channel,
        items: [],
        lastSentAt: null,
        updatedAt: null,
    };

    const existingItems = Array.isArray(existing.items) ? existing.items : [];
    const duplicateItem = existingItems.find((item) => item.fingerprint === fingerprint);

    let nextItems = existingItems;

    if (!duplicateItem) {
        const queuedItem = {
            fingerprint,
            url,
            headline: normalizeString(alertPayload.headline),
            priority: normalizePriority(alertPayload.priority),
            severity: normalizeString(alertPayload.severity || 'none'),
            businessImpact: normalizeString(alertPayload.businessImpact || 'low'),
            primaryType: normalizeString(alertPayload.primaryType || 'Unknown'),
            reviewWindow: normalizeString(alertPayload.reviewWindow || 'monitor'),
            requiresHumanReview: Boolean(alertPayload.requiresHumanReview),
            recommendedAction: normalizeString(alertPayload.recommendedAction),
            topDrivers: Array.isArray(alertPayload.topDrivers)
                ? alertPayload.topDrivers.slice(0, 5).map((item) => normalizeString(item))
                : [],
            queuedAt: nowIso,
        };

        nextItems = [...existingItems, queuedItem];
    }

    const oldestQueuedAt = nextItems.length > 0 ? nextItems[0].queuedAt : null;
    const oldestMs = oldestQueuedAt ? new Date(oldestQueuedAt).getTime() : nowMs;
    const oldestAgeMinutes = nextItems.length > 0
        ? (nowMs - oldestMs) / (1000 * 60)
        : 0;

    let trigger = null;

    if (nextItems.length >= safeMaxItems) {
        trigger = 'max_items';
    } else if (nextItems.length > 0 && oldestAgeMinutes >= safeWindowMinutes) {
        trigger = 'window_elapsed';
    }

    const queueRecord = {
        channel,
        items: nextItems,
        lastSentAt: existing.lastSentAt || null,
        updatedAt: nowIso,
    };

    await Actor.setValue(queueKey, queueRecord);

    const shouldSendDigest = Boolean(trigger);
    const digestPayload = shouldSendDigest
        ? buildDigestPayload({
            channel,
            items: nextItems,
            trigger,
            windowMinutes: safeWindowMinutes,
            maxItems: safeMaxItems,
        })
        : null;

    return {
        queueKey,
        channel,
        fingerprint,
        duplicateSkipped: Boolean(duplicateItem),
        queued: !duplicateItem,
        queueCount: nextItems.length,
        shouldSendDigest,
        trigger,
        digestPayload,
        oldestQueuedAt,
        oldestAgeMinutes: Math.round(oldestAgeMinutes * 100) / 100,
        windowMinutes: safeWindowMinutes,
        maxItems: safeMaxItems,
        evaluatedAt: nowIso,
    };
}

export async function recordDigestDelivery({
    channel = 'policy-digests',
    webhookResult = null,
}) {
    const queueKey = buildDigestQueueKey(channel);
    const nowIso = new Date().toISOString();

    await Actor.setValue(queueKey, {
        channel,
        items: [],
        lastSentAt: nowIso,
        updatedAt: nowIso,
        lastWebhookResult: webhookResult || null,
    });

    return {
        queueKey,
        channel,
        flushedAt: nowIso,
        webhookResult: webhookResult || null,
    };
}