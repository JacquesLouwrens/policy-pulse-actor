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

function priorityFromRank(rank) {
    switch (clamp(rank, 0, 4)) {
        case 0:
            return 'p0';
        case 1:
            return 'p1';
        case 2:
            return 'p2';
        case 3:
            return 'p3';
        default:
            return 'p4';
    }
}

function buildHash(input) {
    return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

function buildEscalationKey(url) {
    return `alert-escalation-${buildHash(url)}`;
}

function buildEscalationFingerprint(alertPayload = {}) {
    const source = {
        primaryType: normalizeString(alertPayload.primaryType),
        headline: normalizeString(alertPayload.headline),
        severity: normalizeString(alertPayload.severity),
        businessImpact: normalizeString(alertPayload.businessImpact),
        topDrivers: Array.isArray(alertPayload.topDrivers)
            ? alertPayload.topDrivers.slice(0, 5).map((item) => normalizeString(item))
            : [],
    };

    return createHash('sha256')
        .update(JSON.stringify(source))
        .digest('hex');
}

function reviewWindowForPriority(priority, existingWindow = 'monitor') {
    const normalized = normalizePriority(priority);

    if (normalized === 'p0') return 'immediate';
    if (normalized === 'p1') return existingWindow === 'immediate' ? 'immediate' : '24h';
    if (normalized === 'p2') return existingWindow === 'immediate' ? 'immediate' : existingWindow;
    return existingWindow;
}

export async function evaluateAlertEscalation({
    url,
    alertPayload,
    escalationWindowHours = 24,
} = {}) {
    const safeWindowHours = clamp(Number(escalationWindowHours) || 24, 1, 24 * 14);
    const escalationKey = buildEscalationKey(url);
    const fingerprint = buildEscalationFingerprint(alertPayload);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const previous = await Actor.getValue(escalationKey);

    const originalPriority = normalizePriority(alertPayload?.priority);
    let escalatedPriority = originalPriority;
    let escalationLevel = 0;
    let repeatedWithinWindowCount = 0;
    let reason = 'No prior alert history for escalation';

    if (previous?.fingerprint && previous.fingerprint === fingerprint && previous.lastTriggeredAt) {
        const previousMs = new Date(previous.lastTriggeredAt).getTime();
        const hoursSinceLastTrigger = (nowMs - previousMs) / (1000 * 60 * 60);

        if (hoursSinceLastTrigger <= safeWindowHours) {
            repeatedWithinWindowCount = (previous.repeatedWithinWindowCount || 0) + 1;

            if (repeatedWithinWindowCount >= 3) {
                escalationLevel = 2;
            } else if (repeatedWithinWindowCount >= 2) {
                escalationLevel = 1;
            }

            reason =
                escalationLevel > 0
                    ? `Repeated matching alerts detected within ${safeWindowHours}h window`
                    : `Matching alert repeated within ${safeWindowHours}h window`;
        } else {
            reason = 'Previous alert history exists, but escalation window expired';
        }
    }

    if (escalationLevel > 0) {
        const newRank = priorityRank(originalPriority) - escalationLevel;
        escalatedPriority = priorityFromRank(newRank);
    }

    const escalated = escalatedPriority !== originalPriority;

    return {
        escalationKey,
        fingerprint,
        originalPriority,
        escalatedPriority,
        escalated,
        escalationLevel,
        repeatedWithinWindowCount,
        escalationWindowHours: safeWindowHours,
        evaluatedAt: nowIso,
        reason,
    };
}

export function applyEscalationToAlert(alertPayload = {}, escalationDecision = {}) {
    const updatedPayload = {
        ...alertPayload,
        priority: escalationDecision.escalatedPriority || alertPayload.priority || 'p4',
        reviewWindow: reviewWindowForPriority(
            escalationDecision.escalatedPriority || alertPayload.priority || 'p4',
            alertPayload.reviewWindow || 'monitor'
        ),
    };

    if (escalationDecision.escalated) {
        updatedPayload.headline = `[ESCALATED] ${normalizeString(alertPayload.headline)}`;
        updatedPayload.requiresHumanReview = true;
        updatedPayload.escalationNote = escalationDecision.reason;
    }

    return updatedPayload;
}

export async function recordEscalationEvent({
    url,
    alertPayload,
    escalationDecision,
    webhookResult = null,
}) {
    const escalationKey = escalationDecision?.escalationKey || buildEscalationKey(url);

    const record = {
        url,
        escalationKey,
        fingerprint: escalationDecision?.fingerprint || buildEscalationFingerprint(alertPayload),
        lastTriggeredAt: new Date().toISOString(),
        repeatedWithinWindowCount: escalationDecision?.repeatedWithinWindowCount || 0,
        escalationLevel: escalationDecision?.escalationLevel || 0,
        priority: normalizePriority(alertPayload?.priority),
        primaryType: normalizeString(alertPayload?.primaryType),
        headline: normalizeString(alertPayload?.headline),
        lastWebhookResult: webhookResult || null,
    };

    await Actor.setValue(escalationKey, record);
    return record;
}