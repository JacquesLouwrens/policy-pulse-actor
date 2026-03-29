function formatList(items = []) {
    if (!Array.isArray(items) || items.length === 0) return 'None identified.';
    return items.map((item) => `- ${item}`).join('\n');
}

function readableChangeSummary(semanticDiff, isFirstSeen = false) {
    if (isFirstSeen) {
        return 'This is the first time this policy has been processed. A baseline was created for future comparisons.';
    }

    const added = semanticDiff?.added?.length || 0;
    const removed = semanticDiff?.removed?.length || 0;
    const modified = semanticDiff?.modified?.length || 0;
    const total = added + removed + modified;

    if (total === 0) {
        return 'No meaningful semantic changes were detected in this run.';
    }

    return `Detected ${total} semantic changes: ${added} added, ${removed} removed, ${modified} modified.`;
}

export function formatClientReport({
    url,
    policyClassification,
    semanticDiff,
    riskAssessment,
    changeExplanations = [],
    isFirstSeen = false,
}) {
    const primaryType = policyClassification?.primaryType || 'Unknown';
    const verticals = policyClassification?.verticals || [];

    const keyFindings = changeExplanations
        .slice(0, 5)
        .map((item) => {
            const category = item?.category || 'general policy language';
            const direction = item?.direction || 'changed';
            const numeric = item?.numericChange ? ' Numeric values or deadlines changed.' : '';
            return `${category}: ${direction}.${numeric}`;
        });

    return {
        title: `Policy Pulse Report — ${primaryType}`,
        generatedAt: new Date().toISOString(),
        audience: 'client',
        sections: {
            overview: `Policy type: ${primaryType}. Relevant verticals: ${
                verticals.length ? verticals.join(', ') : 'None'
            }.`,
            changeSummary: readableChangeSummary(semanticDiff, isFirstSeen),
            riskSummary: `Risk score: ${riskAssessment?.riskScore ?? 0}/100. Severity: ${
                riskAssessment?.severity || 'none'
            }. Business impact: ${riskAssessment?.businessImpact || 'low'}.`,
            recommendedAction:
                riskAssessment?.recommendedAction ||
                'Monitor future changes and assess relevance.',
            keyDrivers: formatList(riskAssessment?.drivers || []),
            keyFindings: formatList(keyFindings),
            source: url,
        },
    };
}