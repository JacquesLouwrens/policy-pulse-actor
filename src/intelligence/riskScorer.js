function unique(array) {
    return [...new Set(array.filter(Boolean))];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function severityToBaseScore(severity) {
    switch (severity) {
        case 'critical':
            return 70;
        case 'high':
            return 55;
        case 'medium':
            return 35;
        case 'low':
            return 20;
        default:
            return 5;
    }
}

function classificationWeight(primaryType, verticals = []) {
    let score = 0;

    switch (primaryType) {
        case 'Financial Regulation':
            score += 18;
            break;
        case 'Healthcare Compliance':
            score += 18;
            break;
        case 'Tax / VAT':
            score += 16;
            break;
        case 'AI Governance':
            score += 14;
            break;
        case 'Data Protection Guidance':
            score += 14;
            break;
        case 'Privacy Policy':
            score += 10;
            break;
        case 'Terms of Service':
            score += 8;
            break;
        case 'Cookie Policy':
            score += 6;
            break;
        default:
            score += 0;
    }

    for (const vertical of verticals) {
        if (vertical === 'Banking/FinTech') score += 6;
        if (vertical === 'Healthcare') score += 6;
        if (vertical === 'Tax') score += 5;
        if (vertical === 'AI') score += 4;
        if (vertical === 'Privacy') score += 4;
        if (vertical === 'SaaS') score += 3;
    }

    return score;
}

function explanationRiskScore(changeExplanations = []) {
    let score = 0;
    const drivers = [];

    for (const explanation of changeExplanations) {
        if (explanation.numericChange) {
            score += 10;
            drivers.push('Numeric threshold or deadline changed');
        }

        if (explanation.direction === 'more restrictive') {
            score += 12;
            drivers.push('Policy became more restrictive');
        } else if (explanation.direction === 'less restrictive') {
            score += 4;
            drivers.push('Policy became less restrictive');
        }

        switch (explanation.category) {
            case 'refund policy':
                score += 7;
                drivers.push('Customer-facing refund terms changed');
                break;
            case 'data rights':
                score += 12;
                drivers.push('User or data subject rights changed');
                break;
            case 'cookie policy':
                score += 5;
                drivers.push('Cookie or tracking terms changed');
                break;
            case 'billing terms':
                score += 9;
                drivers.push('Billing or payment terms changed');
                break;
            case 'termination terms':
                score += 10;
                drivers.push('Termination or suspension terms changed');
                break;
            case 'data retention':
                score += 11;
                drivers.push('Data retention terms changed');
                break;
            case 'security obligations':
                score += 14;
                drivers.push('Security-related obligations changed');
                break;
            case 'tax / vat':
                score += 15;
                drivers.push('Tax or VAT language changed');
                break;
            case 'ai governance':
                score += 13;
                drivers.push('AI governance terms changed');
                break;
            default:
                score += 3;
                drivers.push('General policy wording changed');
        }
    }

    return {
        score,
        drivers: unique(drivers),
    };
}

function diffRiskScore(semanticDiff) {
    let score = 0;
    const drivers = [];

    const addedCount = semanticDiff?.added?.length || 0;
    const removedCount = semanticDiff?.removed?.length || 0;
    const modifiedCount = semanticDiff?.modified?.length || 0;

    if (addedCount > 0) {
        score += Math.min(addedCount * 4, 12);
        drivers.push('New policy concepts introduced');
    }

    if (removedCount > 0) {
        score += Math.min(removedCount * 6, 18);
        drivers.push('Existing policy concepts removed');
    }

    if (modifiedCount > 0) {
        score += Math.min(modifiedCount * 7, 21);
        drivers.push('Existing policy concepts modified');
    }

    return {
        score,
        drivers: unique(drivers),
    };
}

function determineBusinessImpact(score) {
    if (score >= 85) return 'critical';
    if (score >= 65) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
}

function buildRecommendedAction(score, businessImpact, changeExplanations = [], primaryType = 'Unknown') {
    const hasRestrictiveChange = changeExplanations.some(
        (item) => item.direction === 'more restrictive'
    );
    const hasNumericChange = changeExplanations.some(
        (item) => item.numericChange
    );

    if (score >= 85) {
        return `Immediate legal/compliance review recommended for ${primaryType}.`;
    }

    if (score >= 65) {
        if (hasRestrictiveChange || hasNumericChange) {
            return `Priority review recommended. Validate operational and legal impact for ${primaryType}.`;
        }
        return `High-priority review recommended for ${primaryType}.`;
    }

    if (score >= 40) {
        return `Review during the next compliance cycle and confirm whether workflows or notices need updates.`;
    }

    if (businessImpact === 'low') {
        return 'Monitor for future changes; immediate action is likely not required.';
    }

    return 'Review and monitor for downstream impact.';
}

export function scorePolicyRisk({
    semanticDiff = { added: [], removed: [], modified: [], severity: 'none' },
    policyClassification = {
        primaryType: 'Unknown',
        secondaryTypes: [],
        verticals: [],
        confidence: 0,
        matches: [],
    },
    changeExplanations = [],
} = {}) {
    const baseScore = severityToBaseScore(semanticDiff.severity);
    const classScore = classificationWeight(
        policyClassification.primaryType,
        policyClassification.verticals || []
    );
    const explanationPart = explanationRiskScore(changeExplanations);
    const diffPart = diffRiskScore(semanticDiff);

    const confidenceBonus = Math.round((policyClassification.confidence || 0) * 8);

    const rawScore =
        baseScore +
        classScore +
        explanationPart.score +
        diffPart.score +
        confidenceBonus;

    const riskScore = clamp(rawScore, 0, 100);
    const businessImpact = determineBusinessImpact(riskScore);

    const drivers = unique([
        ...explanationPart.drivers,
        ...diffPart.drivers,
        policyClassification.primaryType !== 'Unknown'
            ? `Primary classification: ${policyClassification.primaryType}`
            : null,
        ...(policyClassification.verticals || []).map((vertical) => `Vertical: ${vertical}`),
    ]);

    return {
        riskScore,
        severity: semanticDiff.severity || 'none',
        businessImpact,
        recommendedAction: buildRecommendedAction(
            riskScore,
            businessImpact,
            changeExplanations,
            policyClassification.primaryType
        ),
        drivers,
    };
}
