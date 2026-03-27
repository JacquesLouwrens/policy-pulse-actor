// main.js

// ========== ES MODULE IMPORTS ==========
import { Actor } from 'apify';
import OUTPUT_CONTRACT from './output-contract.json' assert { type: 'json' };

import { fetchPolicyText } from './src/fetchers/policyFetcher.js';
import { extractSemanticMeaning } from './src/intelligence/semanticEngine.js';
import { detectSemanticChange } from './src/intelligence/changeDetector.js';
import { generateSignals } from './src/signals/signalGenerator.js';

// ========== LOGGER ==========
const log = Actor.log;

// ========== OUTPUT VALIDATION FUNCTIONS ==========
function validateAgainstContract(output) {
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
async function generateOutput(semanticDiff, signals, url) {
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
        url: url,
    };

    validateAgainstContract(output);
    return output;
}

// ========== MAIN ACTOR ==========
Actor.main(async () => {
    try {
        log.info('Actor started');

        const input = await Actor.getInput();

        if (!input?.url) {
            throw new Error('Input must include a "url" field.');
        }

        log.info('Fetching target URL', { url: input.url });

        // STEP 1 — Fetch policy text using fixed fetchPolicyText
        const rawText = await fetchPolicyText(input.url);

        // STEP 2 — Load previous semantic snapshot
        const previousSemantic =
            (await Actor.getValue('semantic-last')) || {
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

        log.info('Semantic processing completed');

        // STEP 6 — Generate output
        const output = await generateOutput(semanticDiff, signals, input.url);

        // ========== STORAGE ==========
        await Actor.setValue('OUTPUT', output);
        await Actor.setValue('semantic-diff', semanticDiff);

        const meta = {
            actorVersion: '1.0.0',
            runTimestamp: new Date().toISOString(),
            severity: output.severity,
            changeCount: output.summary.totalChanges,
        };

        await Actor.setValue('meta', meta);

        await Actor.setValue('semantic-current', currentSemantic);
        await Actor.setValue('semantic-last', currentSemantic);
        await Actor.setValue('signals', signals);

        // Dataset output
        await Actor.pushData(output);

        log.info('Actor finished successfully');
        console.log('Output:', JSON.stringify(output, null, 2));

    } catch (error) {
        log.error('Actor failed', {
            message: error.message,
            stack: error.stack,
        });

        throw error;
    }
});
