// main.js

// ========== ES MODULE IMPORTS ==========
import { Actor } from 'apify';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { fetchPolicyText } from './src/fetchers/policyFetcher.js';
import { extractSemanticMeaning } from './src/intelligence/semanticEngine.js';
import { detectSemanticChange } from './src/intelligence/changeDetector.js';
import { generateSignals } from './src/signals/signalGenerator.js';

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
function generateSummary(semanticDiff, signals, url) {
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
function calculateConfidence(semanticDiff, signals) {
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
async function generateOutput(semanticDiff, signals, url, OUTPUT_CONTRACT) {
    const output = {
        added: semanticDiff.added || [],
        removed: semanticDiff.removed || [],
        modified: semanticDiff.modified || [],
        severity: semanticDiff.severity || 'none',

        summary: {
            totalChanges:
                (semanticDiff.added?.length || 0) +
                (semanticDiff.removed?.length || 0) +
                (semanticDiff.modified?.length || 0),
            addedCount: semanticDiff.added?.length || 0,
            removedCount: semanticDiff.removed?.length || 0,
            modifiedCount: semanticDiff.modified?.length || 0,
        },

        summaryText: generateSummary(semanticDiff, signals, url),

        hasSemanticChange:
            (semanticDiff.added?.length || 0) > 0 ||
            (semanticDiff.removed?.length || 0) > 0 ||
            (semanticDiff.modified?.length || 0) > 0,

        confidence: calculateConfidence(semanticDiff, signals),

        timestamp: new Date().toISOString(),
        url,
    };

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

// ========== INPUT NORMALIZATION ==========
function normalizeInputToUrls(input) {
    let parsedInput = input;

    // Case 1: whole input is a string
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

    // Case 2: input.url itself contains a stringified JSON object
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
                // leave as-is if it isn't valid JSON
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

// ========== SINGLE URL PROCESSOR ==========
async function processUrl(targetUrl, OUTPUT_CONTRACT, log) {
    const snapshotKey = buildSnapshotKey(targetUrl);
    const currentSnapshotKey = buildCurrentSnapshotKey(targetUrl);
    const diffKey = buildDiffKey(targetUrl);
    const signalsKey = buildSignalsKey(targetUrl);
    const outputKey = buildOutputKey(targetUrl);

    log?.info('Fetching target URL', { url: targetUrl, snapshotKey }) ||
        console.log('Fetching target URL', targetUrl, snapshotKey);

    // STEP 1 — Fetch policy text
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
        };

        await Actor.setValue(outputKey, blockedOutput);
        await Actor.pushData(blockedOutput);

        log?.info('Recorded fetch failure for URL', { url: targetUrl, snapshotKey }) ||
            console.log('Recorded fetch failure for URL', targetUrl);

        return blockedOutput;
    }

    // STEP 2 — Load previous semantic snapshot for THIS URL only
    const previousSemantic = (await Actor.getValue(snapshotKey)) || {
        topics: [],
        obligations: [],
        permissions: [],
        restrictions: [],
    };

    // STEP 3 — Extract current semantic meaning
    const currentSemantic = extractSemanticMeaning(rawText);

    // STEP 4 — Detect semantic change
    const semanticDiff = detectSemanticChange(previousSemantic, currentSemantic);

    // STEP 5 — Generate signals
    const signals = generateSignals(semanticDiff) || [];

    log?.info('Semantic processing completed', {
        url: targetUrl,
        snapshotKey,
        previousTopics: previousSemantic.topics?.length || 0,
        currentTopics: currentSemantic.topics?.length || 0,
    }) || console.log('Semantic processing completed');

    // STEP 6 — Generate output
    const output = await generateOutput(
        semanticDiff,
        signals,
        targetUrl,
        OUTPUT_CONTRACT
    );

    output.snapshotKey = snapshotKey;
    output.fetchStatus = 'success';

    // ========== STORAGE ==========
    await Actor.setValue(outputKey, output);
    await Actor.setValue(diffKey, semanticDiff);
    await Actor.setValue(currentSnapshotKey, currentSemantic);
    await Actor.setValue(snapshotKey, currentSemantic);
    await Actor.setValue(signalsKey, signals);

    // Dataset output
    await Actor.pushData(output);

    log?.info('Processed URL successfully', {
        url: targetUrl,
        snapshotKey,
        outputKey,
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
                    return await processUrl(targetUrl, OUTPUT_CONTRACT, log);
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
