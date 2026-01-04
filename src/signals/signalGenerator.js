export function generateSignals(diff) {
    const signals = [];

    if (diff.severityScore > 0) {
        signals.push({
            type: 'POLICY_CHANGE',
            severity: diff.severityScore,
            timestamp: new Date().toISOString(),
            details: diff
        });
    }

    return signals;
}
