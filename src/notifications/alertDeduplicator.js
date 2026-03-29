import { Actor } from 'apify';
import { createHash } from 'node:crypto';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function stableArray(values, maxItems = 5) {
    if (!Array.isArray(values)) return [];
    return values
        .filter(Boolean)
        .map((item) => normalizeString(item))
        .filter(Boolean)
        .slice(0, maxItems);
}

function buildHash(input) {
    return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

function buildDedupKey(url) {
    return `alert-dedup-${buildHash(url)}`;
}

function buildAlertFingerprint(alertPayload = {}) {
    const fingerprintSource = {
        headline: normalizeString(alertPayload.headline),
        severity: normalizeString(alertPayload.severity),
        priority: normalizeString(alertPayload.priority),
        primaryType: normalizeString(alertPayload.primaryType),
        businessImpact: normalizeString(alertPayload.businessImpact),
        reviewWindow: normalizeString(alertPayload.reviewWindow),
        topDrivers: stableArray(alertPayload.topDrivers, 5),
        message: normalizeString(alertPayload.message),
        recommendedAction: normalizeString(alertPayload.recommendedAction),
    };

    return createHash('sha256')
        .update(JSON.stringify(fingerprintSource))
        .digest('hex');
}

export async function evaluateAlertDedup({
    url,
    alertPayload,
    cooldownMinutes = 60,
}) {
    const safeCooldownMinutes = clamp(Number(cooldownMinutes) || 60, 1, 24 * 60);
    const dedupKey = buildDedupKey(url);
    const fingerprint = buildAlertFingerprint(alertPayload);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const previous = await Actor.getValue(dedupKey);

    if (!previous) {
        return {
            shouldSend: true,
            dedupKey,
            fingerprint,
            reason: 'No previous alert recorded for this URL',
            previousFingerprint: null,
            cooldownMinutes: safeCooldownMinutes,
            lastSentAt: null,
            duplicateCount: 0,
            recordedAt: nowIso,
        };
    }

    const previousFingerprint = previous.fingerprint || null;
    const previousSentAt = previous.lastSentAt || null;
    const previousSentMs = previousSentAt ? new Date(previousSentAt).getTime() : 0;
    const minutesSinceLastSend =
        previousSentMs > 0 ? (nowMs - previousSentMs) / (1000 * 60) : Number.POSITIVE_INFINITY;

    const sameFingerprint = previousFingerprint === fingerprint;
    const withinCooldown = minutesSinceLastSend < safeCooldownMinutes;

    if (sameFingerprint && withinCooldown) {
        return {
            shouldSend: false,
            dedupKey,
            fingerprint,
            reason: `Duplicate alert fingerprint within ${safeCooldownMinutes}-minute cooldown window`,
            previousFingerprint,
            cooldownMinutes: safeCooldownMinutes,
            lastSentAt: previousSentAt,
            duplicateCount: (previous.duplicateCount || 0) + 1,
            minutesSinceLastSend: Math.round(minutesSinceLastSend * 100) / 100,
            recordedAt: nowIso,
        };
    }

    return {
        shouldSend: true,
        dedupKey,
        fingerprint,
        reason: sameFingerprint
            ? 'Cooldown expired for matching alert fingerprint'
            : 'Alert fingerprint changed',
        previousFingerprint,
        cooldownMinutes: safeCooldownMinutes,
        lastSentAt: previousSentAt,
        duplicateCount: sameFingerprint ? (previous.duplicateCount || 0) : 0,
        minutesSinceLastSend:
            Number.isFinite(minutesSinceLastSend)
                ? Math.round(minutesSinceLastSend * 100) / 100
                : null,
        recordedAt: nowIso,
    };
}

export async function recordSentAlert({
    url,
    alertPayload,
    fingerprint,
    cooldownMinutes = 60,
    webhookResult = null,
}) {
    const dedupKey = buildDedupKey(url);
    const nowIso = new Date().toISOString();

    const previous = await Actor.getValue(dedupKey);

    const payloadSnapshot = {
        headline: normalizeString(alertPayload?.headline),
        severity: normalizeString(alertPayload?.severity),
        priority: normalizeString(alertPayload?.priority),
        primaryType: normalizeString(alertPayload?.primaryType),
        businessImpact: normalizeString(alertPayload?.businessImpact),
        reviewWindow: normalizeString(alertPayload?.reviewWindow),
        topDrivers: stableArray(alertPayload?.topDrivers, 5),
        recommendedAction: normalizeString(alertPayload?.recommendedAction),
    };

    const record = {
        url,
        fingerprint,
        dedupKey,
        cooldownMinutes: clamp(Number(cooldownMinutes) || 60, 1, 24 * 60),
        lastSentAt: nowIso,
        duplicateCount:
            previous?.fingerprint === fingerprint ? (previous?.duplicateCount || 0) : 0,
        sendCount:
            previous?.fingerprint === fingerprint ? (previous?.sendCount || 0) + 1 : 1,
        payloadSnapshot,
        lastWebhookResult: webhookResult || null,
    };

    await Actor.setValue(dedupKey, record);

    return record;
}