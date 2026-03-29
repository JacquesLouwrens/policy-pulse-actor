export function generateSignals(diff) {
    const signals = [];

    if (!diff || !diff.severity) {
        return signals;
    }

    if (diff.severity !== 'none') {
        signals.push({
            type: 'POLICY_CHANGE',
            severity: diff.severity,
            timestamp: new Date().toISOString(),
            details: {
                added: diff.added || [],
                removed: diff.removed || [],
                modified: diff.modified || [],
            },
        });
    }

    if (diff.severity === 'high' || diff.severity === 'critical') {
        signals.push({
            type: 'HIGH_IMPACT_POLICY_CHANGE',
            severity: diff.severity,
            timestamp: new Date().toISOString(),
            details: {
                added: diff.added || [],
                removed: diff.removed || [],
                modified: diff.modified || [],
            },
        });
    }

    return signals;
}