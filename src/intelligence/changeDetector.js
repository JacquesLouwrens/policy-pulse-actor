/**
 * Semantic Change Detector
 * Compares two semantic snapshots and identifies meaningful changes
 */

/**
 * Main comparison function
 */
export function detectSemanticChange(oldSemantics = {}, newSemantics = {}) {
    const added = detectAdded(oldSemantics, newSemantics);
    const removed = detectRemoved(oldSemantics, newSemantics);
    const modified = detectModified(oldSemantics, newSemantics);
    const severity = calculateSeverity(added, removed, modified);

    return {
        added,
        removed,
        modified,
        severity,
    };
}

function detectAdded(oldS, newS) {
    const changes = [];

    for (const key of semanticKeys()) {
        const oldSet = new Set(oldS[key] || []);
        const newSet = new Set(newS[key] || []);

        const added = [...newSet].filter((x) => !oldSet.has(x));

        if (added.length) {
            changes.push({
                type: 'added',
                category: key,
                affectedItems: added,
                description: `New ${key} introduced`,
            });
        }
    }

    return changes;
}

function detectRemoved(oldS, newS) {
    const changes = [];

    for (const key of semanticKeys()) {
        const oldSet = new Set(oldS[key] || []);
        const newSet = new Set(newS[key] || []);

        const removed = [...oldSet].filter((x) => !newSet.has(x));

        if (removed.length) {
            changes.push({
                type: 'removed',
                category: key,
                affectedItems: removed,
                description: `${key} removed`,
            });
        }
    }

    return changes;
}

function detectModified(oldS, newS) {
    const changes = [];

    for (const key of semanticKeys()) {
        const oldItems = oldS[key] || [];
        const newItems = newS[key] || [];

        const sameLength = oldItems.length === newItems.length;
        const sameValues =
            sameLength &&
            oldItems.every((item) => newItems.includes(item)) &&
            newItems.every((item) => oldItems.includes(item));

        if (!sameValues && oldItems.length > 0 && newItems.length > 0) {
            const oldSet = new Set(oldItems);
            const newSet = new Set(newItems);

            const addedPortion = [...newSet].filter((x) => !oldSet.has(x));
            const removedPortion = [...oldSet].filter((x) => !newSet.has(x));

            if (addedPortion.length > 0 && removedPortion.length > 0) {
                changes.push({
                    type: 'modified',
                    category: key,
                    affectedItems: [...removedPortion, ...addedPortion],
                    description: `${key} changed`,
                });
            }
        }
    }

    return changes;
}

function calculateSeverity(added, removed, modified) {
    const weightMap = {
        obligations: 5,
        restrictions: 4,
        permissions: 3,
        topics: 2,
    };

    let score = 0;

    for (const change of [...added, ...removed, ...modified]) {
        const categoryWeight = weightMap[change.category] || 1;
        const itemCount = change.affectedItems?.length || 1;
        score += categoryWeight * itemCount;
    }

    if (score === 0) return 'none';
    if (score >= 15) return 'critical';
    if (score >= 8) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
}

function semanticKeys() {
    return ['topics', 'obligations', 'permissions', 'restrictions'];
}
