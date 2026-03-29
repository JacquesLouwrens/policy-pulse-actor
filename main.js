// main.js

// ========== ES MODULE IMPORTS ==========
import { Actor } from 'apify';
import fs from 'node:fs/promises';

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

// ========== MAIN ACTOR ==========
Actor.main(async () => {
    const log = Actor.log;

    try {
        log?.info('Actor started') || console.log('Actor started');

        const OUTPUT_CONTRACT = await loadOutputContract();

        const input = await Actor.getInput();

        let targetUrl = input?.url;

        if (!targetUrl && typeof input === 'string') {
            try {
                const parsed = JSON.parse(input);
                targetUrl = parsed?.url;
            } catch {
                targetUrl = input;
            }
        }

        if (typeof targetUrl === 'string') {
            const trimmed = targetUrl.trim();

            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    targetUrl = parsed?.url ?? trimmed;
                } catch {
                    targetUrl = trimmed;
                }
            }
        }

        if (!targetUrl || typeof targetUrl !== 'string') {
            throw new Error('Input must include a valid "url" field.');
        }

        log?.info('Fetching target URL', { url: targetUrl }) ||
            console.log('Fetching target URL', targetUrl);

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
            };

            await Actor.setValue('OUTPUT', blockedOutput);
            await Actor.pushData(blockedOutput);

            log?.info('Actor finished with fetch failure recorded') ||
                console.log('Actor finished with fetch failure recorded');
            console.log('Output:', JSON.stringify(blockedOutput, null, 2));

            return;
        }

        // STEP 2 — Load previous semantic snapshot
        const previousSemantic = (await Actor.getValue('semantic-last')) || {
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

        log?.info('Semantic processing completed') ||
            console.log('Semantic processing completed');

        // STEP 6 — Generate output
        const output = await generateOutput(
            semanticDiff,
            signals,
            targetUrl,
            OUTPUT_CONTRACT
        );

        // ========== STORAGE ==========
        await Actor.setValue('OUTPUT', output);
        await Actor.setValue('semantic-diff', semanticDiff);
        await Actor.setValue('semantic-current', currentSemantic);
        await Actor.setValue('semantic-last', currentSemantic);
        await Actor.setValue('signals', signals);

        // Dataset output
        await Actor.pushData(output);

        log?.info('Actor finished successfully') ||
            console.log('Actor finished successfully');
        console.log('Output:', JSON.stringify(output, null, 2));
    } catch (error) {
        console.error('Actor failed:', error?.message || error);
        throw error;
    }
});
