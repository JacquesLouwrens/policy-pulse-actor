function truncate(text, max = 160) {
    if (!text || typeof text !== 'string') return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

function topDrivers(drivers = [], max = 4) {
    return Array.isArray(drivers) ? drivers.slice(0, max) : [];
}

export function formatDashboardView({
    url,
    summaryText,
    semanticDiff,
    policyClassification,
    riskAssessment,
    changeExplanations = [],
    isFirstSeen = false,
}) {
    const totalChanges =
        (semanticDiff?.added?.length || 0) +
        (semanticDiff?.removed?.length || 0) +
        (semanticDiff?.modified?.length || 0);

    return {
        status: isFirstSeen ? 'baseline_created' : 'processed',
        url,
        primaryType: policyClassification?.primaryType || 'Unknown',
        verticals: policyClassification?.verticals || [],
        severity: riskAssessment?.severity || semanticDiff?.severity || 'none',
        riskScore: riskAssessment?.riskScore ?? 0,
        businessImpact: riskAssessment?.businessImpact || 'low',
        priority: riskAssessment?.priority || 'p4',
        requiresHumanReview: Boolean(riskAssessment?.requiresHumanReview),
        reviewWindow: riskAssessment?.reviewWindow || 'monitor',
        totalChanges,
        addedCount: semanticDiff?.added?.length || 0,
        removedCount: semanticDiff?.removed?.length || 0,
        modifiedCount: semanticDiff?.modified?.length || 0,
        topDrivers: topDrivers(riskAssessment?.drivers || [], 4),
        topChangeCategories: changeExplanations
            .map((item) => item?.category)
            .filter(Boolean)
            .slice(0, 5),
        summaryText: truncate(summaryText, 220),
        updatedAt: new Date().toISOString(),
    };
}