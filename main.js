// main.js
// ES MODULES MUST COME FIRST
import { Actor } from 'apify';

// ... rest of your imports
import { fetchPolicyText } from './src/fetchers/policyFetcher.js';
import { extractSemanticMeaning } from './src/intelligence/semanticEngine.js';
import { detectSemanticChange } from './src/intelligence/changeDetector.js';
import { generateSignals } from './src/signals/signalGenerator.js';

// COMMONJS IMPORTS (like require) MUST COME AFTER ES MODULES
const OUTPUT_CONTRACT = require('./output-contract.json');

// Initialize the logger from Actor
const log = Actor.utils.log;

// ========== OUTPUT VALIDATION FUNCTIONS ==========
function validateAgainstContract(output) {
    // Enhanced validation
    const required = ['added', 'removed', 'modified', 'severity', 'summary'];
    
    for (const field of required) {
        if (output[field] === undefined || output[field] === null) {
            throw new Error(`Output contract violation: Missing ${field}`);
        }
    }
    
    // Type checking
    if (!Array.isArray(output.added)) {
        throw new Error('Output contract violation: "added" must be an array');
    }
    if (!Array.isArray(output.removed)) {
        throw new Error('Output contract violation: "removed" must be an array');
    }
    if (!Array.isArray(output.modified)) {
        throw new Error('Output contract violation: "modified" must be an array');
    }
    
    // Severity validation
    const validSeverities = ['none', 'low', 'medium', 'high', 'critical'];
    if (!validSeverities.includes(output.severity)) {
        throw new Error(`Output contract violation: Invalid severity "${output.severity}". Must be one of: ${validSeverities.join(', ')}`);
    }
    
    // Summary validation
    if (!output.summary || typeof output.summary !== 'object') {
        throw new Error('Output contract violation: "summary" must be an object');
    }
    
    console.log('✅ Output contract validation passed');
}

// Helper function to create contract-compliant output
async function generateOutput(semanticDiff, signals, url) {
    const output = {
        added: semanticDiff.added || [],
        removed: semanticDiff.removed || [],
        modified: semanticDiff.modified || [],
        severity: semanticDiff.severity || 'none',
        summary: {
            totalChanges: (semanticDiff.added?.length || 0) + 
                         (semanticDiff.removed?.length || 0) + 
                         (semanticDiff.modified?.length || 0),
            addedCount: semanticDiff.added?.length || 0,
            removedCount: semanticDiff.removed?.length || 0,
            modifiedCount: semanticDiff.modified?.length || 0
        },
        hasSemanticChange: (semanticDiff.added?.length || 0) > 0 || 
                          (semanticDiff.removed?.length || 0) > 0 || 
                          (semanticDiff.modified?.length || 0) > 0,
        confidence: calculateConfidence(semanticDiff, signals),
        timestamp: new Date().toISOString(),
        url: url
    };
    
    validateAgainstContract(output);
    return output;
}

function calculateConfidence(semanticDiff, signals) {
    let confidence = 0.5;
    if (signals.length > 0) {
        confidence += Math.min(signals.length * 0.1, 0.3);
    }
    const totalChanges = semanticDiff.added.length + semanticDiff.removed.length + semanticDiff.modified.length;
    if (totalChanges > 0) {
        confidence += Math.min(totalChanges * 0.1, 0.3);
    }
    if (semanticDiff.removed.length > 0) {
        confidence += 0.15;
    }
    if (semanticDiff.severity === 'high') {
        confidence += 0.2;
    } else if (semanticDiff.severity === 'medium') {
        confidence += 0.1;
    }
    return Math.min(Math.max(confidence, 0), 1.0);
}

Actor.main(async () => {
    try {
        // Actor started log - at the very beginning
        log.info('Actor started');
        
        // Load input first to get the URL
        const input = await Actor.getInput();
        
        if (!input?.url) {
            throw new Error('Input must include a "url" field.');
        }
        
        // Fetching target URL log - before fetching
        log.info('Fetching target URL', { url: input.url });
        
        // STEP 1 - Fetch policy text
        const rawText = await fetchPolicyText(input.url);
        
        // STEP 2.5.2 — Load previous semantic snapshot
        const previousSemantic =
            (await Actor.getValue('semantic-last')) || {
                topics: [],
                obligations: [],
                permissions: [],
                restrictions: []
            };
        
        // STEP 2.5.3 — Extract current semantic meaning
        const currentSemantic = extractSemanticMeaning(rawText);
        
        // STEP 2.5.4 — Detect semantic change
        const semanticDiff = detectSemanticChange(previousSemantic, currentSemantic);
        
        // STEP 2.5.5 — Generate signals
        const signals = generateSignals(semanticDiff);
        
        // Semantic processing completed log
        log.info('Semantic processing completed');
        
                // ========== UPDATED: CREATE CONTRACT-COMPLIANT OUTPUT ==========

        const output = await generateOutput(semanticDiff, signals, input.url);
        
        // ========== REQUIRED KV STORAGE ==========
        // 1. OUTPUT → semantic extraction (contract-compliant output)
        await Actor.setValue('OUTPUT', output);
        
        // 2. semantic-diff → change detection (store the raw semantic diff)
        await Actor.setValue('semantic-diff', semanticDiff);
        
        // 3. meta → run metadata (as specified in requirements)
        const meta = {
            actorVersion: '1.0.0',
            runTimestamp: new Date().toISOString(),
            severity: output.severity,
            changeCount: output.summary.totalChanges
        };
        await Actor.setValue('meta', meta);
        
        // ========== KEEP YOUR EXISTING STORAGE ==========
        await Actor.setValue('semantic-current', currentSemantic);
        await Actor.setValue('semantic-last', currentSemantic);
        await Actor.setValue('signals', signals);
        
        // Store in Dataset (optional - for backward compatibility)
        await Actor.pushData(output);
        
        log.info('Actor finished successfully');
        console.log('Output:', JSON.stringify(output, null, 2));
        console.log('Semantic diff stored in key-value store');
        
    } catch (error) {
        // Graceful error handling
        log.error('Actor failed', { 
            message: error.message, 
            stack: error.stack 
        });
        
        // Re-throw the error so Apify knows the run failed
        throw error;
    }
});

// Helper function to calculate confidence score
function generateSummary(semanticDiff, signals, url) {
    const totalChanges = semanticDiff.added.length + semanticDiff.removed.length + semanticDiff.modified.length;
    
    if (totalChanges === 0) {
        return `No semantic changes detected in policy from ${url}.`;
    }
    
    const changes = [];
    
    if (semanticDiff.added.length > 0) {
        changes.push(`${semanticDiff.added.length} additions`);
    }
    if (semanticDiff.removed.length > 0) {
        changes.push(`${semanticDiff.removed.length} removals`);
    }
    if (semanticDiff.modified.length > 0) {
        changes.push(`${semanticDiff.modified.length} modifications`);
    }
    
    const severity = semanticDiff.severity ? ` (${semanticDiff.severity} severity)` : '';
    
    return `Detected ${totalChanges} semantic changes${severity}: ${changes.join(', ')}. ${
        signals.length > 0 ? `${signals.length} alert signals generated. ` : ''
    }Source: ${url}`;
}