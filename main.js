// main.js

// ========== ES MODULE IMPORTS ==========
import { Actor } from 'apify';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { fetchPolicyText } from './src/fetchers/policyFetcher.js';
import { extractSemanticMeaning } from './src/intelligence/semanticEngine.js';
import { detectSemanticChange } from './src/intelligence/changeDetector.js';
import { generateSignals } from './src/signals/signalGenerator.js';
import { classifyPolicyType } from './src/intelligence/policyClassifier.js';
import { explainPolicyChanges } from './src/intelligence/changeExplainer.js';
import { scorePolicyRisk } from './src/intelligence/riskScorer.js';
import { formatDashboardView } from './src/presentation/dashboardFormatter.js';
import { formatAlertPayload } from './src/presentation/alertFormatter.js';
import { formatClientReport } from './src/presentation/reportFormatter.js';
import { sendWebhookAlert } from './src/notifications/webhookNotifier.js';
import { evaluateAlertDedup, recordSentAlert } from './src/notifications/alertDeduplicator.js';
import {
    evaluateAlertEscalation,
    applyEscalationToAlert,
    recordEscalationEvent,
} from './src/notifications/alertEscalator.js';
import {
    shouldUseImmediateDelivery,
    shouldQueueForDigest,
    queueDigestAlert,
    recordDigestDelivery,
} from './src/notifications/digestManager.js';
import { formatSlackPayload } from './src/notifications/slackFormatter.js';
import {
    resolveDeliveryPreferences,
    evaluateDeliveryPreferences,
} from './src/delivery/deliveryPreferences.js';
import {
    routeImmediateAlert,
    routeDigestAlert,
} from './src/notifications/channelRouter.js';

// ========== OUTPUT VALIDATION FUNCTIONS ==========
function validateAgainstContract(output, OUTPUT_CONTRACT) {
    const required = ['added', 'removed', 'modified', 'severity', 'summary'];

    for (const field of required) {
        if (output[field] === undefined || output[field] === null) {
            throw new Error(`Output contract violation: Missing ${field}`);
        }
    }

    if (!Array.isArray(output.added)) {
        throw new Error('Output contract violation: "added" must be an array');
    }

    if (!Array.isArray(output.removed)) {
        throw new Error('Output contract violation: "removed" must be an array');
    }

    if (!Array.isArray(output.modified)) {
        throw new Error('Output contract violation: "modified" must be an array');
    }

    const validSeverities = ['none', 'low', 'medium', 'high', 'critical'];
    if (!validSeverities.includes(output.severity)) {
        throw new Error(
            `Output contract violation: Invalid severity "${output.severity}". Must be one of: ${validSeverities.join(', ')}`
        );
    }

    if (!output.summary || typeof output.summary !== 'object') {
        throw new Error('Output contract violation: "summary" must be an object');
    }

    console.log('✅ Output contract validation passed');
}

// ========== SUMMARY GENERATOR ==========
function generateSummary(semanticDiff, signals, url, isFirstSeen = false) {
    if (isFirstSeen) {
        return `Initial baseline established for policy at ${url}. Future runs will detect meaningful changes from this point forward.`;
    }

    const totalChanges =
        (semanticDiff.added?.length || 0) +
        (semanticDiff.removed?.length || 0) +
        (semanticDiff.modified?.length || 0);

    if (totalChanges === 0) {
        return `No semantic changes detected in policy from ${url}.`;
    }

    const changes = [];

    if ((semanticDiff.added?.length || 0) > 0) {
        changes.push(`${semanticDiff.added.length} additions`);
    }

    if ((semanticDiff.removed?.length || 0) > 0) {
        changes.push(`${semanticDiff.removed.length} removals`);
    }

    if ((semanticDiff.modified?.length || 0) > 0) {
        changes.push(`${semanticDiff.modified.length} modifications`);
    }

    const severity = semanticDiff.severity ? ` (${semanticDiff.severity} severity)` : '';

    return `Detected ${totalChanges} semantic changes${severity}: ${changes.join(', ')}. ${
        (signals?.length || 0) > 0 ? `${signals.length} alert signals generated. ` : ''
    }Source: ${url}`;
}

// ========== CONFIDENCE CALCULATOR ==========
function calculateConfidence(semanticDiff, signals, isFirstSeen = false) {
    if (isFirstSeen) {
        return 0.35;
    }

    let confidence = 0.5;

    if ((signals?.length || 0) > 0) {
        confidence += Math.min(signals.length * 0.1, 0.3);
    }

    const totalChanges =
        (semanticDiff.added?.length || 0) +
        (semanticDiff.removed?.length || 0) +
        (semanticDiff.modified?.length || 0);

    if (totalChanges > 0) {
        confidence += Math.min(totalChanges * 0.1, 0.3);
    }

    if ((semanticDiff.removed?.length || 0) > 0) {
        confidence += 0.15;
    }

    if (semanticDiff.severity === 'high') {
        confidence += 0.2;
    } else if (semanticDiff.severity === 'medium') {
        confidence += 0.1;
    }

    return Math.min(Math.max(confidence, 0), 1.0);
}

// ========== OUTPUT GENERATOR ==========
async function generateOutput(
    semanticDiff,
    signals,
    url,
    OUTPUT_CONTRACT,
    policyClassification = null,
    changeExplanations = [],
    riskAssessment = null,
    isFirstSeen = false
) {
    const output = {
        added: semanticDiff.added || [],
        removed: semanticDiff.removed || [],
        modified: semanticDiff.modified || [],
        severity: isFirstSeen ? 'none' : (semanticDiff.severity || 'none'),

        summary: {
            totalChanges: isFirstSeen
                ? 0
                : (semanticDiff.added?.length || 0) +
                  (semanticDiff.removed?.length || 0) +
                  (semanticDiff.modified?.length || 0),
            addedCount: isFirstSeen ? 0 : (semanticDiff.added?.length || 0),
            removedCount: isFirstSeen ? 0 : (semanticDiff.removed?.length || 0),
            modifiedCount: isFirstSeen ? 0 : (semanticDiff.modified?.length || 0),
        },

        summaryText: generateSummary(semanticDiff, signals, url, isFirstSeen),

        hasSemanticChange: isFirstSeen
            ? false
            : (semanticDiff.added?.length || 0) > 0 ||
              (semanticDiff.removed?.length || 0) > 0 ||
              (semanticDiff.modified?.length || 0) > 0,

        confidence: calculateConfidence(semanticDiff, signals, isFirstSeen),

        timestamp: new Date().toISOString(),
        url,
        isFirstSeen,
        changeExplanations: isFirstSeen
            ? []
            : (Array.isArray(changeExplanations) ? changeExplanations : []),
    };

    if (policyClassification) {
        output.policyClassification = policyClassification;
    }

    if (riskAssessment) {
        output.riskAssessment = riskAssessment;
    }

    output.dashboardView = formatDashboardView({
        url,
        summaryText: output.summaryText,
        semanticDiff,
        policyClassification,
        riskAssessment,
        changeExplanations,
        isFirstSeen,
    });

    output.alertPayload = formatAlertPayload({
        url,
        policyClassification,
        riskAssessment,
        semanticDiff,
        summaryText: output.summaryText,
        isFirstSeen,
    });

    output.clientReport = formatClientReport({
        url,
        policyClassification,
        semanticDiff,
        riskAssessment,
        changeExplanations,
        isFirstSeen,
    });

    validateAgainstContract(output, OUTPUT_CONTRACT);
    return output;
}

// ========== SAFE JSON LOADER ==========
async function loadOutputContract() {
    const raw = await fs.readFile(
        new URL('./output-contract.json', import.meta.url),
        'utf-8'
    );
    return JSON.parse(raw);
}

// ========== URL KEY HELPERS ==========
function buildHash(url) {
    return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function buildSnapshotKey(url) {
    return `semantic-last-${buildHash(url)}`;
}

function buildCurrentSnapshotKey(url) {
    return `semantic-current-${buildHash(url)}`;
}

function buildDiffKey(url) {
    return `semantic-diff-${buildHash(url)}`;
}

function buildSignalsKey(url) {
    return `signals-${buildHash(url)}`;
}

function buildOutputKey(url) {
    return `OUTPUT-${buildHash(url)}`;
}

function buildRawTextKey(url) {
    return `raw-last-${buildHash(url)}`;
}

function buildRawCurrentKey(url) {
    return `raw-current-${buildHash(url)}`;
}

// ========== INPUT NORMALIZATION ==========
function normalizeInputToUrls(input) {
    let parsedInput = input;

    if (typeof parsedInput === 'string') {
        const trimmed = parsedInput.trim();

        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                parsedInput = JSON.parse(trimmed);
            } catch {
                parsedInput = { url: trimmed };
            }
        } else {
            parsedInput = { url: trimmed };
        }
    }

    if (typeof parsedInput?.url === 'string') {
        const trimmedUrl = parsedInput.url.trim();

        if (
            (trimmedUrl.startsWith('{') && trimmedUrl.endsWith('}')) ||
            (trimmedUrl.startsWith('[') && trimmedUrl.endsWith(']'))
        ) {
            try {
                const reparsed = JSON.parse(trimmedUrl);

                if (typeof reparsed === 'object' && reparsed !== null) {
                    parsedInput = reparsed;
                }
            } catch {
                // leave as-is
            }
        }
    }

    const urls = [];

    if (typeof parsedInput?.url === 'string') {
        urls.push(parsedInput.url);
    }

    if (Array.isArray(parsedInput?.urls)) {
        for (const value of parsedInput.urls) {
            if (typeof value === 'string') {
                const trimmed = value.trim();

                if (
                    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                    (trimmed.startsWith('[') && trimmed.endsWith(']'))
                ) {
                    try {
                        const reparsed = JSON.parse(trimmed);

                        if (typeof reparsed?.url === 'string') {
                            urls.push(reparsed.url);
                        }

                        if (Array.isArray(reparsed?.urls)) {
                            for (const nested of reparsed.urls) {
                                if (typeof nested === 'string') {
                                    urls.push(nested);
                                }
                            }
                        }
                    } catch {
                        urls.push(trimmed);
                    }
                } else {
                    urls.push(trimmed);
                }
            }
        }
    }

    const cleanedUrls = [
        ...new Set(
            urls
                .map((url) => url.trim())
                .filter(Boolean)
        ),
    ];

    if (cleanedUrls.length === 0) {
        throw new Error('Input must include "url" (string) or "urls" (array of strings).');
    }

    return cleanedUrls;
}

// ========== CONCURRENCY NORMALIZATION ==========
function normalizeConcurrency(input) {
    let rawConcurrency = input?.concurrency;

    if (typeof input === 'string') {
        const trimmed = input.trim();

        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                const parsed = JSON.parse(trimmed);
                rawConcurrency = parsed?.concurrency;
            } catch {
                // ignore
            }
        }
    }

    const parsedNumber = Number(rawConcurrency);

    if (!Number.isFinite(parsedNumber)) {
        return 2;
    }

    return Math.max(1, Math.min(Math.floor(parsedNumber), 5));
}

// ========== DELIVERY CONTEXT HELPERS ==========
function extractDeliveryContext(input) {
    return {
        tenantId: typeof input?.tenantId === 'string' ? input.tenantId.trim() : null,
        userId: typeof input?.userId === 'string' ? input.userId.trim() : null,
        inlinePreferences:
            input?.deliveryPreferences && typeof input.deliveryPreferences === 'object'
                ? input.deliveryPreferences
                : null,
    };
}

// ========== SINGLE URL PROCESSOR ==========
async function processUrl(targetUrl, OUTPUT_CONTRACT, log, deliveryContext = {}) {
    const snapshotKey = buildSnapshotKey(targetUrl);
    const currentSnapshotKey = buildCurrentSnapshotKey(targetUrl);
    const diffKey = buildDiffKey(targetUrl);
    const signalsKey = buildSignalsKey(targetUrl);
    const outputKey = buildOutputKey(targetUrl);
    const rawTextKey = buildRawTextKey(targetUrl);
    const rawCurrentKey = buildRawCurrentKey(targetUrl);

    log?.info('Fetching target URL', { url: targetUrl, snapshotKey }) ||
        console.log('Fetching target URL', targetUrl, snapshotKey);

    let rawText = '';
    let fetchError = null;

    try {
        rawText = await fetchPolicyText(targetUrl);
    } catch (err) {
        fetchError = err;
        log?.warning('Fetch failed', { url: targetUrl, error: err.message }) ||
            console.warn('Fetch failed', targetUrl, err.message);
    }

    if (fetchError) {
        const blockedOutput = {
            added: [],
            removed: [],
            modified: [],
            severity: 'none',
            summary: {
                totalChanges: 0,
                addedCount: 0,
                removedCount: 0,
                modifiedCount: 0,
            },
            summaryText: `Unable to fetch policy content from ${targetUrl}: ${fetchError.message}`,
            hasSemanticChange: false,
            confidence: 0,
            timestamp: new Date().toISOString(),
            url: targetUrl,
            fetchStatus: 'failed',
            fetchError: fetchError.message,
            snapshotKey,
            isFirstSeen: false,
            changeExplanations: [],
            policyClassification: {
                primaryType: 'Unknown',
                secondaryTypes: [],
                verticals: [],
                confidence: 0,
                matches: [],
            },
            riskAssessment: {
                riskScore: 0,
                severity: 'none',
                businessImpact: 'low',
                recommendedAction: 'Unable to assess risk because the policy page could not be fetched.',
                drivers: ['Fetch failed'],
                baselineMode: false,
            },
            dashboardView: {
                status: 'fetch_failed',
                url: targetUrl,
                primaryType: 'Unknown',
                verticals: [],
                severity: 'none',
                riskScore: 0,
                businessImpact: 'low',
                priority: 'p4',
                requiresHumanReview: false,
                reviewWindow: 'monitor',
                totalChanges: 0,
                addedCount: 0,
                removedCount: 0,
                modifiedCount: 0,
                topDrivers: ['Fetch failed'],
                topChangeCategories: [],
                summaryText: `Unable to fetch policy content from ${targetUrl}: ${fetchError.message}`,
                updatedAt: new Date().toISOString(),
            },
            alertPayload: {
                channel: 'policy-alerts',
                headline: 'Policy fetch failed',
                severity: 'none',
                priority: 'p4',
                riskScore: 0,
                businessImpact: 'low',
                requiresHumanReview: false,
                reviewWindow: 'monitor',
                url: targetUrl,
                primaryType: 'Unknown',
                topDrivers: ['Fetch failed'],
                message: `Unable to fetch policy content from ${targetUrl}: ${fetchError.message}`,
                recommendedAction: 'Retry fetch and verify source accessibility.',
                createdAt: new Date().toISOString(),
            },
            clientReport: {
                title: 'Policy Pulse Report — Fetch Failed',
                generatedAt: new Date().toISOString(),
                audience: 'client',
                sections: {
                    overview: 'The source policy page could not be fetched during this run.',
                    changeSummary: 'No change analysis could be completed.',
                    riskSummary: 'Risk could not be assessed because source retrieval failed.',
                    recommendedAction: 'Retry the run and verify the target URL is reachable.',
                    keyDrivers: '- Fetch failed',
                    keyFindings: '- No policy content was available for analysis.',
                    source: targetUrl,
                },
            },
            alertDedup: {
                shouldSend: false,
                reason: 'Fetch failed before dedup evaluation',
                cooldownMinutes: Number(process.env.ALERT_COOLDOWN_MINUTES || 60),
            },
            alertEscalation: {
                escalated: false,
                reason: 'Fetch failed before escalation evaluation',
                escalationWindowHours: Number(process.env.ALERT_ESCALATION_WINDOW_HOURS || 24),
            },
            deliveryDecision: {
                route: 'skip',
                reason: 'Fetch failed before delivery preference evaluation',
            },
            digestRouting: {
                mode: 'none',
                reason: 'Fetch failed before digest evaluation',
            },
            digestDelivery: {
                attempted: false,
                skipped: true,
                reason: 'Fetch failed before digest stage',
                deliveredAt: null,
            },
            webhookDelivery: {
                attempted: false,
                skipped: true,
                reason: 'Fetch failed before webhook stage',
                deliveredAt: null,
            },
        };

        await Actor.setValue(outputKey, blockedOutput);
        await Actor.pushData(blockedOutput);

        log?.info('Recorded fetch failure for URL', { url: targetUrl, snapshotKey }) ||
            console.log('Recorded fetch failure for URL', targetUrl);

        return blockedOutput;
    }

    const previousSemantic = (await Actor.getValue(snapshotKey)) || {
        topics: [],
        obligations: [],
        permissions: [],
        restrictions: [],
    };

    const previousRawText = (await Actor.getValue(rawTextKey)) || '';
    const isFirstSeen = !previousRawText;

    const currentSemantic = extractSemanticMeaning(rawText);
    const policyClassification = classifyPolicyType(rawText, targetUrl);
    const changeExplanations = isFirstSeen ? [] : explainPolicyChanges(previousRawText, rawText);

    const semanticDiff = isFirstSeen
        ? { added: [], removed: [], modified: [], severity: 'none' }
        : detectSemanticChange(previousSemantic, currentSemantic);

    const riskAssessment = scorePolicyRisk({
        semanticDiff,
        policyClassification,
        changeExplanations,
        isFirstSeen,
    });

    const signals = isFirstSeen ? [] : (generateSignals(semanticDiff) || []);

    log?.info('Semantic processing completed', {
        url: targetUrl,
        snapshotKey,
        isFirstSeen,
        previousTopics: previousSemantic.topics?.length || 0,
        currentTopics: currentSemantic.topics?.length || 0,
        primaryPolicyType: policyClassification.primaryType,
        classificationConfidence: policyClassification.confidence,
        changeExplanationCount: changeExplanations.length,
        riskScore: riskAssessment.riskScore,
        businessImpact: riskAssessment.businessImpact,
    }) || console.log('Semantic processing completed');

    const output = await generateOutput(
        semanticDiff,
        signals,
        targetUrl,
        OUTPUT_CONTRACT,
        policyClassification,
        changeExplanations,
        riskAssessment,
        isFirstSeen
    );

    output.snapshotKey = snapshotKey;
    output.fetchStatus = 'success';

    const resolvedDelivery = await resolveDeliveryPreferences(deliveryContext);
    output.deliveryPreferences = {
        tenantId: resolvedDelivery.tenantId,
        userId: resolvedDelivery.userId,
        sources: resolvedDelivery.sources,
        effective: resolvedDelivery.preferences,
    };

    const webhookUrl = process.env.WEBHOOK_URL || null;
    const alertCooldownMinutes = Number(process.env.ALERT_COOLDOWN_MINUTES || 60);
    const alertEscalationWindowHours = Number(process.env.ALERT_ESCALATION_WINDOW_HOURS || 24);
    const digestWindowMinutes = Number(process.env.DIGEST_WINDOW_MINUTES || 180);
    const digestMaxItems = Number(process.env.DIGEST_MAX_ITEMS || 5);
    const digestChannel = process.env.DIGEST_CHANNEL || 'policy-digests';

    if (webhookUrl && output?.alertPayload) {
        const escalationDecision = await evaluateAlertEscalation({
            url: targetUrl,
            alertPayload: output.alertPayload,
            escalationWindowHours: alertEscalationWindowHours,
        });

        output.alertEscalation = escalationDecision;

        const finalAlertPayload = applyEscalationToAlert(
            output.alertPayload,
            escalationDecision
        );

        output.alertPayload = finalAlertPayload;

        if (output.dashboardView) {
            output.dashboardView.priority = finalAlertPayload.priority;
            output.dashboardView.requiresHumanReview = Boolean(finalAlertPayload.requiresHumanReview);
            output.dashboardView.reviewWindow =
                finalAlertPayload.reviewWindow || output.dashboardView.reviewWindow;
            output.dashboardView.topDrivers = Array.isArray(finalAlertPayload.topDrivers)
                ? finalAlertPayload.topDrivers.slice(0, 4)
                : output.dashboardView.topDrivers;
        }

        if (output.riskAssessment) {
            output.riskAssessment.priority = finalAlertPayload.priority;
            output.riskAssessment.requiresHumanReview = Boolean(finalAlertPayload.requiresHumanReview);
            output.riskAssessment.reviewWindow =
                finalAlertPayload.reviewWindow || output.riskAssessment.reviewWindow;
        }

        const preferenceDecision = evaluateDeliveryPreferences({
            url: targetUrl,
            alertPayload: finalAlertPayload,
            preferences: resolvedDelivery.preferences,
        });

        output.deliveryDecision = preferenceDecision;

        const useImmediateDelivery =
            preferenceDecision.route === 'immediate' &&
            shouldUseImmediateDelivery(finalAlertPayload);

        const useDigestDelivery =
            preferenceDecision.route === 'digest' &&
            shouldQueueForDigest(finalAlertPayload);

        if (useImmediateDelivery) {
            output.digestRouting = {
                mode: 'immediate',
                reason: preferenceDecision.reason,
            };

            const dedupDecision = await evaluateAlertDedup({
                url: targetUrl,
                alertPayload: finalAlertPayload,
                cooldownMinutes: alertCooldownMinutes,
            });

            output.alertDedup = dedupDecision;

            if (dedupDecision.shouldSend) {
                                const channelRouteResult = await routeImmediateAlert({
                    alertPayload: finalAlertPayload,
                    preferences: resolvedDelivery.preferences,
                });

                output.channelDelivery = channelRouteResult;

                const primaryChannelResult =
                    channelRouteResult.results.slack ||
                    channelRouteResult.results.email ||
                    { success: false, skipped: true, reason: 'No channel result available' };

                output.webhookDelivery = {
                    attempted: Boolean(channelRouteResult.results.slack),
                    ...(channelRouteResult.results.slack || {
                        skipped: true,
                        reason: 'Slack channel not used',
                    }),
                    deliveredAt: new Date().toISOString(),
                };

                output.digestDelivery = {
                    attempted: false,
                    skipped: true,
                    reason: 'Immediate delivery path used',
                    deliveredAt: null,
                };

                if (primaryChannelResult?.success) {
                    await recordEscalationEvent({
                        url: targetUrl,
                        alertPayload: finalAlertPayload,
                        escalationDecision,
                        webhookResult: primaryChannelResult,
                    });

                    await recordSentAlert({
                        url: targetUrl,
                        alertPayload: finalAlertPayload,
                        fingerprint: dedupDecision.fingerprint,
                        cooldownMinutes: alertCooldownMinutes,
                        webhookResult: primaryChannelResult,
                    });
                }

                log?.info('Immediate multi-channel alert processed', {
                    url: targetUrl,
                    priority: finalAlertPayload.priority,
                    requiresHumanReview: finalAlertPayload.requiresHumanReview,
                    channels: channelRouteResult.channels,
                    dedupReason: dedupDecision.reason,
                    escalated: escalationDecision.escalated,
                    preferenceReason: preferenceDecision.reason,
                }) || console.log('Immediate multi-channel alert processed', targetUrl);

                log?.info('Immediate Slack alert processed', {
                    url: targetUrl,
                    priority: finalAlertPayload.priority,
                    requiresHumanReview: finalAlertPayload.requiresHumanReview,
                    webhookSuccess: webhookResult?.success || false,
                    dedupReason: dedupDecision.reason,
                    escalated: escalationDecision.escalated,
                    preferenceReason: preferenceDecision.reason,
                }) || console.log('Immediate Slack alert processed', targetUrl);
            } else {
                output.webhookDelivery = {
                    attempted: false,
                    skipped: true,
                    reason: dedupDecision.reason,
                    deliveredAt: null,
                };

                output.digestDelivery = {
                    attempted: false,
                    skipped: true,
                    reason: 'Immediate alert skipped by dedup layer',
                    deliveredAt: null,
                };

                log?.info('Immediate Slack alert skipped by dedup layer', {
                    url: targetUrl,
                    priority: finalAlertPayload.priority,
                    dedupReason: dedupDecision.reason,
                    lastSentAt: dedupDecision.lastSentAt,
                    preferenceReason: preferenceDecision.reason,
                }) || console.log('Immediate Slack alert skipped by dedup layer', targetUrl);
            }
        } else if (useDigestDelivery) {
            output.alertDedup = {
                shouldSend: false,
                reason: 'Digest path selected; immediate dedup not applied',
                cooldownMinutes: alertCooldownMinutes,
            };

            const digestDecision = await queueDigestAlert({
                url: targetUrl,
                alertPayload: finalAlertPayload,
                channel: digestChannel,
                windowMinutes: digestWindowMinutes,
                maxItems: digestMaxItems,
            });

            output.digestRouting = {
                mode: 'digest',
                reason: digestDecision.shouldSendDigest
                    ? `Digest ready via ${digestDecision.trigger}`
                    : preferenceDecision.reason,
                channel: digestChannel,
                queueCount: digestDecision.queueCount,
                duplicateSkipped: digestDecision.duplicateSkipped,
                trigger: digestDecision.trigger,
            };

            if (digestDecision.shouldSendDigest) {
                const slackDigestPayload = formatSlackPayload(digestDecision.digestPayload);
                const digestWebhookResult = await sendWebhookAlert(
                    webhookUrl,
                    slackDigestPayload
                );

                output.digestDelivery = {
                    attempted: true,
                    ...digestWebhookResult,
                    deliveredAt: new Date().toISOString(),
                    trigger: digestDecision.trigger,
                    itemCount: digestDecision.digestPayload?.itemCount || digestDecision.queueCount,
                    renderMode: 'slack_blocks',
                };

                output.webhookDelivery = {
                    attempted: false,
                    skipped: true,
                    reason: 'Digest webhook used instead of immediate alert',
                    deliveredAt: null,
                };

                if (digestWebhookResult?.success) {
                    await recordEscalationEvent({
                        url: targetUrl,
                        alertPayload: finalAlertPayload,
                        escalationDecision,
                        webhookResult: digestWebhookResult,
                    });

                    await recordDigestDelivery({
                        channel: digestChannel,
                        webhookResult: digestWebhookResult,
                    });
                }

                log?.info('Slack digest processed', {
                    url: targetUrl,
                    queueCount: digestDecision.queueCount,
                    trigger: digestDecision.trigger,
                    digestSuccess: digestWebhookResult?.success || false,
                    preferenceReason: preferenceDecision.reason,
                }) || console.log('Slack digest processed', targetUrl);
            } else {
                output.digestDelivery = {
                    attempted: false,
                    skipped: true,
                    reason: digestDecision.duplicateSkipped
                        ? 'Duplicate alert already queued in digest'
                        : 'Digest thresholds not yet met',
                    deliveredAt: null,
                    queueCount: digestDecision.queueCount,
                };

                output.webhookDelivery = {
                    attempted: false,
                    skipped: true,
                    reason: 'Queued for digest delivery',
                    deliveredAt: null,
                };

                log?.info('Alert queued for Slack digest delivery', {
                    url: targetUrl,
                    queueCount: digestDecision.queueCount,
                    duplicateSkipped: digestDecision.duplicateSkipped,
                    preferenceReason: preferenceDecision.reason,
                }) || console.log('Alert queued for Slack digest delivery', targetUrl);
            }
        } else {
            output.alertDedup = {
                shouldSend: false,
                reason: preferenceDecision.reason,
                cooldownMinutes: alertCooldownMinutes,
            };

            output.digestRouting = {
                mode: 'none',
                reason: preferenceDecision.reason,
            };

            output.digestDelivery = {
                attempted: false,
                skipped: true,
                reason: preferenceDecision.reason,
                deliveredAt: null,
            };

            output.webhookDelivery = {
                attempted: false,
                skipped: true,
                reason: preferenceDecision.reason,
                deliveredAt: null,
            };
        }
    } else {
        output.alertEscalation = {
            escalated: false,
            reason: !webhookUrl
                ? 'No webhook URL provided'
                : 'No alert payload available',
            escalationWindowHours: alertEscalationWindowHours,
        };

        output.deliveryDecision = {
            route: 'skip',
            reason: !webhookUrl
                ? 'No webhook URL provided'
                : 'No alert payload available',
        };

        output.alertDedup = {
            shouldSend: false,
            reason: !webhookUrl
                ? 'No webhook URL provided'
                : 'No alert payload available',
            cooldownMinutes: alertCooldownMinutes,
        };

        output.digestRouting = {
            mode: 'none',
            reason: !webhookUrl
                ? 'No webhook URL provided'
                : 'No alert payload available',
        };

        output.digestDelivery = {
            attempted: false,
            skipped: true,
            reason: !webhookUrl
                ? 'No webhook URL provided'
                : 'No alert payload available',
            deliveredAt: null,
        };

        output.webhookDelivery = {
            attempted: false,
            skipped: true,
            reason: !webhookUrl
                ? 'No webhook URL provided'
                : 'No alert payload available',
            deliveredAt: null,
        };
    }

    await Actor.setValue(outputKey, output);
    await Actor.setValue(diffKey, semanticDiff);
    await Actor.setValue(currentSnapshotKey, currentSemantic);
    await Actor.setValue(snapshotKey, currentSemantic);
    await Actor.setValue(signalsKey, signals);
    await Actor.setValue(rawCurrentKey, rawText);
    await Actor.setValue(rawTextKey, rawText);

    await Actor.pushData(output);

    log?.info('Processed URL successfully', {
        url: targetUrl,
        snapshotKey,
        isFirstSeen,
        outputKey,
        riskScore: riskAssessment.riskScore,
        webhookAttempted: output.webhookDelivery?.attempted || false,
        digestAttempted: output.digestDelivery?.attempted || false,
        escalated: output.alertEscalation?.escalated || false,
        deliveryRoute: output.deliveryDecision?.route || 'skip',
    }) || console.log('Processed URL successfully', targetUrl);

    return output;
}

// ========== CONCURRENCY RUNNER ==========
async function runWithConcurrencyLimit(items, concurrency, workerFn) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;

            if (currentIndex >= items.length) {
                return;
            }

            results[currentIndex] = await workerFn(items[currentIndex], currentIndex);
        }
    }

    const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => worker()
    );

    await Promise.all(workers);
    return results;
}

// ========== MAIN ACTOR ==========
Actor.main(async () => {
    const log = Actor.log;

    try {
        log?.info('Actor started') || console.log('Actor started');

        const OUTPUT_CONTRACT = await loadOutputContract();
        const input = await Actor.getInput();
        const deliveryContext = extractDeliveryContext(input);
        const urls = normalizeInputToUrls(input);
        const concurrency = normalizeConcurrency(input);

        log?.info('Parallel processing configuration', {
            urlCount: urls.length,
            concurrency,
        }) || console.log('Parallel processing configuration', { urlCount: urls.length, concurrency });

        const results = await runWithConcurrencyLimit(
            urls,
            concurrency,
            async (targetUrl) => {
                try {
                    return await processUrl(
                        targetUrl,
                        OUTPUT_CONTRACT,
                        log,
                        deliveryContext
                    );
                } catch (err) {
                    const failedItem = {
                        added: [],
                        removed: [],
                        modified: [],
                        severity: 'none',
                        summary: {
                            totalChanges: 0,
                            addedCount: 0,
                            removedCount: 0,
                            modifiedCount: 0,
                        },
                        summaryText: `Unhandled processing error for ${targetUrl}: ${err.message}`,
                        hasSemanticChange: false,
                        confidence: 0,
                        timestamp: new Date().toISOString(),
                        url: targetUrl,
                        fetchStatus: 'failed',
                        fetchError: err.message,
                        isFirstSeen: false,
                        changeExplanations: [],
                        policyClassification: {
                            primaryType: 'Unknown',
                            secondaryTypes: [],
                            verticals: [],
                            confidence: 0,
                            matches: [],
                        },
                        riskAssessment: {
                            riskScore: 0,
                            severity: 'none',
                            businessImpact: 'low',
                            recommendedAction: 'Unable to assess risk because processing failed.',
                            drivers: ['Unhandled processing error'],
                            baselineMode: false,
                        },
                        dashboardView: {
                            status: 'processing_failed',
                            url: targetUrl,
                            primaryType: 'Unknown',
                            verticals: [],
                            severity: 'none',
                            riskScore: 0,
                            businessImpact: 'low',
                            priority: 'p4',
                            requiresHumanReview: false,
                            reviewWindow: 'monitor',
                            totalChanges: 0,
                            addedCount: 0,
                            removedCount: 0,
                            modifiedCount: 0,
                            topDrivers: ['Unhandled processing error'],
                            topChangeCategories: [],
                            summaryText: `Unhandled processing error for ${targetUrl}: ${err.message}`,
                            updatedAt: new Date().toISOString(),
                        },
                        alertPayload: {
                            channel: 'policy-alerts',
                            headline: 'Policy processing failed',
                            severity: 'none',
                            priority: 'p4',
                            riskScore: 0,
                            businessImpact: 'low',
                            requiresHumanReview: false,
                            reviewWindow: 'monitor',
                            url: targetUrl,
                            primaryType: 'Unknown',
                            topDrivers: ['Unhandled processing error'],
                            message: `Unhandled processing error for ${targetUrl}: ${err.message}`,
                            recommendedAction: 'Inspect logs and retry processing.',
                            createdAt: new Date().toISOString(),
                        },
                        clientReport: {
                            title: 'Policy Pulse Report — Processing Failed',
                            generatedAt: new Date().toISOString(),
                            audience: 'client',
                            sections: {
                                overview: 'The policy could not be fully processed during this run.',
                                changeSummary: 'No change analysis could be completed.',
                                riskSummary: 'Risk could not be assessed because processing failed.',
                                recommendedAction: 'Inspect logs, correct the processing issue, and retry.',
                                keyDrivers: '- Unhandled processing error',
                                keyFindings: '- Policy analysis did not complete successfully.',
                                source: targetUrl,
                            },
                        },
                        alertDedup: {
                            shouldSend: false,
                            reason: 'Processing failed before dedup evaluation',
                            cooldownMinutes: Number(process.env.ALERT_COOLDOWN_MINUTES || 60),
                        },
                        alertEscalation: {
                            escalated: false,
                            reason: 'Processing failed before escalation evaluation',
                            escalationWindowHours: Number(process.env.ALERT_ESCALATION_WINDOW_HOURS || 24),
                        },
                        deliveryDecision: {
                            route: 'skip',
                            reason: 'Processing failed before delivery preference evaluation',
                        },
                        digestRouting: {
                            mode: 'none',
                            reason: 'Processing failed before digest evaluation',
                        },
                        digestDelivery: {
                            attempted: false,
                            skipped: true,
                            reason: 'Processing failed before digest stage',
                            deliveredAt: null,
                        },
                        webhookDelivery: {
                            attempted: false,
                            skipped: true,
                            reason: 'Processing failed before webhook stage',
                            deliveredAt: null,
                        },
                    };

                    await Actor.pushData(failedItem);

                    log?.error('URL processing failed', { url: targetUrl, error: err.message }) ||
                        console.error('URL processing failed', targetUrl, err.message);

                    return failedItem;
                }
            }
        );

        const runSummary = {
            processedUrls: urls.length,
            successfulUrls: results.filter((item) => item.fetchStatus !== 'failed').length,
            failedUrls: results.filter((item) => item.fetchStatus === 'failed').length,
            firstSeenUrls: results.filter((item) => item.isFirstSeen).length,
            concurrencyUsed: concurrency,
            urls,
            timestamp: new Date().toISOString(),
        };

        await Actor.setValue('OUTPUT', runSummary);

        log?.info('Actor finished successfully', runSummary) ||
            console.log('Actor finished successfully', runSummary);
        console.log('Run summary:', JSON.stringify(runSummary, null, 2));
    } catch (error) {
        console.error('Actor failed:', error?.message || error);
        throw error;
    }
});

