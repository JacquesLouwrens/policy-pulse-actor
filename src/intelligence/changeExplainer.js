function normalizeSentence(sentence) {
    return sentence
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[“”]/g, '"')
        .trim();
}

function splitIntoClauses(text) {
    if (!text || typeof text !== 'string') return [];

    return text
        .replace(/\r/g, ' ')
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?;])\s+|\s{2,}/)
        .map((part) => part.trim())
        .filter((part) => part.length > 20);
}

function tokenizeForSimilarity(text) {
    return normalizeSentence(text)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

function jaccardSimilarity(a, b) {
    const setA = new Set(tokenizeForSimilarity(a));
    const setB = new Set(tokenizeForSimilarity(b));

    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const token of setA) {
        if (setB.has(token)) intersection += 1;
    }

    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

function extractNumbers(text) {
    const matches = text.match(/\b\d+(?:\.\d+)?\b/g);
    return matches ? matches.map(Number) : [];
}

function detectChangeCategory(text) {
    const normalized = normalizeSentence(text);

    if (/\brefund\b|\brefunds\b/.test(normalized)) return 'refund policy';
    if (/\bdelete\b|\berasure\b|\bdata subject\b/.test(normalized)) return 'data rights';
    if (/\bcookie\b|\bcookies\b/.test(normalized)) return 'cookie policy';
    if (/\bpayment\b|\bfees\b|\bcharges\b|\bsubscription\b/.test(normalized)) return 'billing terms';
    if (/\btermination\b|\bsuspend\b|\bcancel\b/.test(normalized)) return 'termination terms';
    if (/\bretention\b|\bretain\b|\bstorage\b/.test(normalized)) return 'data retention';
    if (/\bsecurity\b|\bencryption\b|\bbreach\b/.test(normalized)) return 'security obligations';
    if (/\btax\b|\bvat\b/.test(normalized)) return 'tax / vat';
    if (/\bai\b|\bartificial intelligence\b|\bautomated decision/.test(normalized)) return 'ai governance';

    return 'general policy';
}

function compareRestrictionDirection(oldText, newText) {
    const oldNorm = normalizeSentence(oldText);
    const newNorm = normalizeSentence(newText);

    const restrictiveWords = ['must', 'shall', 'required', 'prohibited', 'forbidden', 'not allowed', 'only'];
    const permissiveWords = ['may', 'can', 'allowed', 'permitted'];

    let oldRestrictive = 0;
    let newRestrictive = 0;
    let oldPermissive = 0;
    let newPermissive = 0;

    for (const word of restrictiveWords) {
        if (oldNorm.includes(word)) oldRestrictive += 1;
        if (newNorm.includes(word)) newRestrictive += 1;
    }

    for (const word of permissiveWords) {
        if (oldNorm.includes(word)) oldPermissive += 1;
        if (newNorm.includes(word)) newPermissive += 1;
    }

    if (newRestrictive > oldRestrictive || newPermissive < oldPermissive) {
        return 'more restrictive';
    }

    if (newRestrictive < oldRestrictive || newPermissive > oldPermissive) {
        return 'less restrictive';
    }

    return 'neutral';
}

function buildChangeSummary(oldText, newText, category) {
    const oldNumbers = extractNumbers(oldText);
    const newNumbers = extractNumbers(newText);

    if (oldNumbers.length > 0 && newNumbers.length > 0 && oldNumbers[0] !== newNumbers[0]) {
        const oldValue = oldNumbers[0];
        const newValue = newNumbers[0];

        if (category === 'refund policy') {
            if (newValue < oldValue) {
                return `Refund window shortened from ${oldValue} to ${newValue}.`;
            }
            return `Refund window extended from ${oldValue} to ${newValue}.`;
        }

        if (newValue < oldValue) {
            return `Numeric threshold changed from ${oldValue} to ${newValue}, making the policy potentially stricter.`;
        }

        return `Numeric threshold changed from ${oldValue} to ${newValue}.`;
    }

    const direction = compareRestrictionDirection(oldText, newText);

    if (direction === 'more restrictive') {
        return 'Policy wording became more restrictive.';
    }

    if (direction === 'less restrictive') {
        return 'Policy wording became less restrictive.';
    }

    return 'Policy wording changed materially.';
}

function buildImpactHint(oldText, newText, category) {
    const direction = compareRestrictionDirection(oldText, newText);
    const oldNumbers = extractNumbers(oldText);
    const newNumbers = extractNumbers(newText);

    if (category === 'refund policy' && oldNumbers.length > 0 && newNumbers.length > 0) {
        if (newNumbers[0] < oldNumbers[0]) {
            return 'Customers have less time to request refunds.';
        }
        if (newNumbers[0] > oldNumbers[0]) {
            return 'Customers have more time to request refunds.';
        }
    }

    if (direction === 'more restrictive') {
        return 'This change may reduce user rights or increase obligations.';
    }

    if (direction === 'less restrictive') {
        return 'This change may broaden permissions or reduce obligations.';
    }

    return 'This change should be reviewed for legal and operational impact.';
}

export function explainPolicyChanges(previousText, currentText) {
    if (!previousText || !currentText || typeof previousText !== 'string' || typeof currentText !== 'string') {
        return [];
    }

    const oldClauses = splitIntoClauses(previousText);
    const newClauses = splitIntoClauses(currentText);

    const explanations = [];
    const usedNewIndexes = new Set();

    for (const oldClause of oldClauses) {
        let bestIndex = -1;
        let bestScore = 0;

        for (let i = 0; i < newClauses.length; i += 1) {
            if (usedNewIndexes.has(i)) continue;

            const score = jaccardSimilarity(oldClause, newClauses[i]);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }

        if (bestIndex === -1) continue;

        const matchedNewClause = newClauses[bestIndex];
        const oldNorm = normalizeSentence(oldClause);
        const newNorm = normalizeSentence(matchedNewClause);

        // changed but still similar enough to likely be the same clause
        if (bestScore >= 0.45 && bestScore < 0.98 && oldNorm !== newNorm) {
            usedNewIndexes.add(bestIndex);

            const category = detectChangeCategory(`${oldClause} ${matchedNewClause}`);

            explanations.push({
                type: 'modified_clause',
                category,
                similarityScore: Number(bestScore.toFixed(2)),
                oldText: oldClause,
                newText: matchedNewClause,
                changeSummary: buildChangeSummary(oldClause, matchedNewClause, category),
                impactHint: buildImpactHint(oldClause, matchedNewClause, category),
                direction: compareRestrictionDirection(oldClause, matchedNewClause),
                numericChange:
                    extractNumbers(oldClause).length > 0 || extractNumbers(matchedNewClause).length > 0,
            });
        }
    }

    return explanations.slice(0, 10);
}