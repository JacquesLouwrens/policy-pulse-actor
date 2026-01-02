/**
 * Semantic Change Detector
 * Compares two semantic snapshots and identifies meaningful changes
 */

/**
 * @typedef {Object} SemanticSnapshot
 * @property {string[]} topics
 * @property {string[]} obligations
 * @property {string[]} permissions
 * @property {string[]} restrictions
 * @property {string[]} entities
 */

/**
 * @typedef {Object} SemanticChange
 * @property {string} type
 * @property {string} description
 * @property {string[]} affectedItems
 */

/**
 * Main comparison function
 */
export function detectSemanticChange(oldSemantics = {}, newSemantics = {}) {
    return {
        added: detectAdded(oldSemantics, newSemantics),
        removed: detectRemoved(oldSemantics, newSemantics),
        modified: detectModified(oldSemantics, newSemantics),
        severity: calculateSeverity(oldSemantics, newSemantics)
    };
}
function detectAdded(oldS, newS) {
    const changes = [];

    for (const key of semanticKeys()) {
        const oldSet = new Set(oldS[key] || []);
        const newSet = new Set(newS[key] || []);

        const added = [...newSet].filter(x => !oldSet.has(x));

        if (added.length) {
            changes.push({
                type: "added",
                category: key,
                affectedItems: added,
                description: `New ${key} introduced`
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

        const removed = [...oldSet].filter(x => !newSet.has(x));

        if (removed.length) {
            changes.push({
                type: "removed",
                category: key,
                affectedItems: removed,
                description: `${key} removed`
            });
        }
    }

    return changes;
}

function detectModified(oldS, newS) {
    const changes = [];

    if (!oldS.summary || !newS.summary) return changes;

    if (oldS.summary !== newS.summary) {
        changes.push({
            type: "modified",
            category: "summary",
            affectedItems: [oldS.summary, newS.summary],
            description: "Policy intent summary changed"
        });
    }

    return changes;
}

function calculateSeverity(oldS, newS) {
    let score = 0;

    const weights = {
        obligations: 5,
        restrictions: 4,
        permissions: 3,
        topics: 2,
        entities: 1
    };

    for (const key of semanticKeys()) {
        const oldLen = (oldS[key] || []).length;
        const newLen = (newS[key] || []).length;

        if (oldLen !== newLen) {
            score += Math.abs(newLen - oldLen) * (weights[key] || 1);
        }
    }

    if (score >= 15) return "critical";
    if (score >= 8) return "high";
    if (score >= 4) return "medium";
    return "low";
}

function semanticKeys() {
    return [
        "topics",
        "obligations",
        "permissions",
        "restrictions",
        "entities"
    ];
}

//export function detectSemanticChange(previous, current) {
    // existing implementation stays exactly the same
//}

