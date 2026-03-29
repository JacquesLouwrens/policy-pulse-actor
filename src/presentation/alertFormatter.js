function buildHeadline({ primaryType, severity, riskScore, isFirstSeen }) {
    if (isFirstSeen) {
        return `Baseline created for ${primaryType}`;
    }

    return `${severity.toUpperCase()} policy change detected in ${primaryType} (risk ${riskScore})`;
}

function buildRecommendedNextStep(riskAssessment) {
    if (!riskAssessment) return 'Monitor for future updates.';

    if (riskAssessment.reviewWindow === 'immediate') {
        return 'Escalate immediately to the relevant review team.';
    }

    if (riskAssessment.reviewWindow === '24h') {
        return 'Review within 24 hours.';
    }

    if (riskAssessment.reviewWindow === '7d') {
        return 'Review in the next compliance cycle.';
    }

    return 'Monitor and review if needed.';
}

export function formatAlertPayload({
    url,
    policyClassification,
    riskAssessment,
    semanticDiff,
    summaryText,
    isFirstSeen = false,
}) {
    const primaryType = policyClassification?.primaryType || 'Unknown';
    const severity = riskAssessment?.severity || semanticDiff?.severity || 'none';
    const riskScore = riskAssessment?.riskScore ?? 0;

    return {
        channel: 'policy-alerts',
        headline: buildHeadline({
            primaryType,
            severity,
            riskScore,
            isFirstSeen,
        }),
        severity,
        priority: riskAssessment?.priority || 'p4',
        riskScore,
        businessImpact: riskAssessment?.businessImpact || 'low',
        requiresHumanReview: Boolean(riskAssessment?.requiresHumanReview),
        reviewWindow: riskAssessment?.reviewWindow || 'monitor',
        url,
        primaryType,
        topDrivers: (riskAssessment?.drivers || []).slice(0, 3),
        message: summaryText,
        recommendedAction:
            riskAssessment?.recommendedAction || buildRecommendedNextStep(riskAssessment),
        createdAt: new Date().toISOString(),
    };
}