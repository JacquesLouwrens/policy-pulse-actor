function unique(array) {
    return [...new Set((array || []).filter(Boolean))];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function round(value) {
    return Math.round(value);
}

function severityToBaseScore(severity) {
    switch (severity) {
        case 'critical':
            return 72;
        case 'high':
            return 56;
        case 'medium':
            return 36;
        case 'low':
            return 18;
        default:
            return 4;
    }
}

function determineBusinessImpact(score) {
    if (score >= 85) return 'critical';
    if (score >= 65) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
}

function determinePriority(score) {
    if (score >= 85) return 'p0';
    if (score >= 65) return 'p1';
    if (score >= 40) return 'p2';
    if (score >= 20) return 'p3';
    return 'p4';
}

function determineReviewWindow(score, isFirstSeen = false) {
    if (isFirstSeen) return 'baseline_only';
    if (score >= 85) return 'immediate';
    if (score >= 65) return '24h';
    if (score >= 40) return '7d';
    if (score >= 20) return '30d';
    return 'monitor';
}

function typeRiskProfile(primaryType = 'Unknown') {
    switch (primaryType) {
        case 'Financial Regulation':
            return {
                baseWeight: 1.25,
                legal: 1.25,
                operational: 1.0,
                financial: 1.3,
                reputational: 0.85,
            };

        case 'Healthcare Compliance':
            return {
                baseWeight: 1.22,
                legal: 1.3,
                operational: 1.05,
                financial: 1.0,
                reputational: 0.95,
            };

        case 'Tax / VAT':
            return {
                baseWeight: 1.18,
                legal: 1.15,
                operational: 0.95,
                financial: 1.28,
                reputational: 0.75,
            };

        case 'AI Governance':
            return {
                baseWeight: 1.16,
                legal: 1.1,
                operational: 0.95,
                financial: 0.8,
                reputational: 1.2,
            };

        case 'Data Protection Guidance':
            return {
                baseWeight: 1.17,
                legal: 1.22,
                operational: 1.0,
                financial: 0.85,
                reputational: 1.12,
            };

        case 'Privacy Policy':
            return {
                baseWeight: 1.08,
                legal: 1.1,
                operational: 0.85,
                financial: 0.65,
                reputational: 1.0,
            };

        case 'Terms of Service':
            return {
                baseWeight: 1.06,
                legal: 1.0,
                operational: 1.0,
                financial: 0.8,
                reputational: 0.8,
            };

        case 'Cookie Policy':
            return {
                baseWeight: 1.02,
                legal: 0.95,
                operational: 0.75,
                financial: 0.5,
                reputational: 0.75,
            };

        default:
            return {
                baseWeight: 1.0,
                legal: 1.0,
                operational: 1.0,
                financial: 1.0,
                reputational: 1.0,
            };
    }
}

function verticalSensitivity(verticals = []) {
    const profile = {
        legal: 1.0,
        operational: 1.0,
        financial: 1.0,
        reputational: 1.0,
        baseBoost: 0,
    };

    for (const vertical of verticals) {
        switch (vertical) {
            case 'Banking/FinTech':
                profile.legal += 0.14;
                profile.financial += 0.18;
                profile.operational += 0.05;
                profile.baseBoost += 7;
                break;

            case 'Healthcare':
                profile.legal += 0.16;
                profile.reputational += 0.08;
                profile.baseBoost += 7;
                break;

            case 'Tax':
                profile.financial += 0.16;
                profile.legal += 0.08;
                profile.baseBoost += 6;
                break;

            case 'AI':
                profile.reputational += 0.14;
                profile.legal += 0.08;
                profile.baseBoost += 5;
                break;

            case 'Privacy':
                profile.legal += 0.12;
                profile.reputational += 0.1;
                profile.baseBoost += 5;
                break;

            case 'SaaS':
                profile.operational += 0.08;
                profile.reputational += 0.04;
                profile.baseBoost += 3;
                break;

            default:
                break;
        }
    }

    return profile;
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
    const dimensions = {
        legal: 0,
        operational: 0,
        financial: 0,
        reputational: 0,
    };

    for (const explanation of changeExplanations) {
        if (explanation.numericChange) {
            score += 10;
            dimensions.operational += 5;
            dimensions.financial += 5;
            drivers.push('Numeric threshold or deadline changed');
        }

        if (explanation.direction === 'more restrictive') {
            score += 12;
            dimensions.legal += 5;
            dimensions.operational += 4;
            dimensions.reputational += 3;
            drivers.push('Policy became more restrictive');
        } else if (explanation.direction === 'less restrictive') {
            score += 4;
            dimensions.legal += 1;
            dimensions.reputational += 3;
            drivers.push('Policy became less restrictive');
        }

        switch (explanation.category) {
            case 'refund policy':
                score += 7;
                dimensions.financial += 5;
                dimensions.reputational += 2;
                drivers.push('Customer-facing refund terms changed');
                break;

            case 'data rights':
                score += 12;
                dimensions.legal += 7;
                dimensions.reputational += 5;
                drivers.push('User or data subject rights changed');
                break;

            case 'cookie policy':
                score += 5;
                dimensions.legal += 2;
                dimensions.reputational += 3;
                drivers.push('Cookie or tracking terms changed');
                break;

            case 'billing terms':
                score += 9;
                dimensions.financial += 6;
                dimensions.operational += 3;
                drivers.push('Billing or payment terms changed');
                break;

            case 'termination terms':
                score += 10;
                dimensions.legal += 5;
                dimensions.operational += 5;
                drivers.push('Termination or suspension terms changed');
                break;

            case 'data retention':
                score += 11;
                dimensions.legal += 6;
                dimensions.operational += 3;
                dimensions.reputational += 2;
                drivers.push('Data retention terms changed');
                break;

            case 'security obligations':
                score += 14;
                dimensions.legal += 5;
                dimensions.operational += 6;
                dimensions.reputational += 3;
                drivers.push('Security-related obligations changed');
                break;

            case 'tax / vat':
                score += 15;
                dimensions.legal += 4;
                dimensions.financial += 11;
                drivers.push('Tax or VAT language changed');
                break;

            case 'ai governance':
                score += 13;
                dimensions.legal += 4;
                dimensions.reputational += 9;
                drivers.push('AI governance terms changed');
                break;

            default:
                score += 3;
                dimensions.operational += 1;
                dimensions.reputational += 2;
                drivers.push('General policy wording changed');
        }
    }

    return {
        score,
        drivers: unique(drivers),
        dimensions,
    };
}

function diffRiskScore(semanticDiff = {}) {
    let score = 0;
    const drivers = [];
    const dimensions = {
        legal: 0,
        operational: 0,
        financial: 0,
        reputational: 0,
    };

    const addedCount = semanticDiff?.added?.length || 0;
    const removedCount = semanticDiff?.removed?.length || 0;
    const modifiedCount = semanticDiff?.modified?.length || 0;

    if (addedCount > 0) {
        const delta = Math.min(addedCount * 4, 12);
        score += delta;
        dimensions.legal += round(delta * 0.35);
        dimensions.operational += round(delta * 0.3);
        dimensions.financial += round(delta * 0.15);
        dimensions.reputational += round(delta * 0.2);
        drivers.push('New policy concepts introduced');
    }

    if (removedCount > 0) {
        const delta = Math.min(removedCount * 6, 18);
        score += delta;
        dimensions.legal += round(delta * 0.35);
        dimensions.operational += round(delta * 0.25);
        dimensions.financial += round(delta * 0.15);
        dimensions.reputational += round(delta * 0.25);
        drivers.push('Existing policy concepts removed');
    }

    if (modifiedCount > 0) {
        const delta = Math.min(modifiedCount * 7, 21);
        score += delta;
        dimensions.legal += round(delta * 0.25);
        dimensions.operational += round(delta * 0.35);
        dimensions.financial += round(delta * 0.2);
        dimensions.reputational += round(delta * 0.2);
        drivers.push('Existing policy concepts modified');
    }

    return {
        score,
        drivers: unique(drivers),
        dimensions,
    };
}

function severityDimensions(severity = 'none') {
    switch (severity) {
        case 'critical':
            return { legal: 16, operational: 18, financial: 18, reputational: 14 };
        case 'high':
            return { legal: 12, operational: 13, financial: 12, reputational: 10 };
        case 'medium':
            return { legal: 7, operational: 8, financial: 7, reputational: 6 };
        case 'low':
            return { legal: 3, operational: 4, financial: 3, reputational: 2 };
        default:
            return { legal: 0, operational: 0, financial: 0, reputational: 0 };
    }
}

function combineDimensionScores({
    severity,
    explanationDimensions,
    diffDimensions,
    typeProfile,
    verticalProfile,
    confidenceBonus = 0,
}) {
    const severityPart = severityDimensions(severity);

    const legalRaw =
        (severityPart.legal + explanationDimensions.legal + diffDimensions.legal) *
        typeProfile.legal *
        verticalProfile.legal;

    const operationalRaw =
        (severityPart.operational + explanationDimensions.operational + diffDimensions.operational) *
        typeProfile.operational *
        verticalProfile.operational;

    const financialRaw =
        (severityPart.financial + explanationDimensions.financial + diffDimensions.financial) *
        typeProfile.financial *
        verticalProfile.financial;

    const reputationalRaw =
        (severityPart.reputational + explanationDimensions.reputational + diffDimensions.reputational) *
        typeProfile.reputational *
        verticalProfile.reputational;

    return {
        legal: clamp(round(legalRaw + confidenceBonus * 0.3), 0, 100),
        operational: clamp(round(operationalRaw + confidenceBonus * 0.25), 0, 100),
        financial: clamp(round(financialRaw + confidenceBonus * 0.25), 0, 100),
        reputational: clamp(round(reputationalRaw + confidenceBonus * 0.2), 0, 100),
    };
}

function calculateOverallScore({
    baseScore,
    classScore,
    explanationScore,
    diffScore,
    confidenceBonus,
    typeProfile,
    verticalProfile,
    dimensionScores,
}) {
    const weightedDimensionAverage =
        dimensionScores.legal * 0.34 +
        dimensionScores.operational * 0.26 +
        dimensionScores.financial * 0.24 +
        dimensionScores.reputational * 0.16;

    const rawScore =
        (baseScore + classScore + explanationScore + diffScore + confidenceBonus + verticalProfile.baseBoost) *
            typeProfile.baseWeight +
        weightedDimensionAverage * 0.35;

    return clamp(round(rawScore), 0, 100);
}

function buildRecommendedAction({
    score,
    businessImpact,
    changeExplanations = [],
    primaryType = 'Unknown',
    isFirstSeen = false,
    dimensionScores = null,
}) {
    if (isFirstSeen) {
        return `Baseline established for ${primaryType}. Monitor future changes from this point forward.`;
    }

    const hasRestrictiveChange = changeExplanations.some(
        (item) => item.direction === 'more restrictive'
    );
    const hasNumericChange = changeExplanations.some(
        (item) => item.numericChange
    );

    const legalHigh = (dimensionScores?.legal || 0) >= 70;
    const operationalHigh = (dimensionScores?.operational || 0) >= 70;
    const financialHigh = (dimensionScores?.financial || 0) >= 70;
    const reputationalHigh = (dimensionScores?.reputational || 0) >= 70;

    if (score >= 85) {
        if (legalHigh) {
            return `Immediate legal/compliance review recommended for ${primaryType}.`;
        }
        if (financialHigh) {
            return `Immediate finance/compliance review recommended for ${primaryType}.`;
        }
        if (operationalHigh) {
            return `Immediate operational review recommended for ${primaryType}; workflows may need urgent changes.`;
        }
        return `Immediate cross-functional review recommended for ${primaryType}.`;
    }

    if (score >= 65) {
        if (hasRestrictiveChange || hasNumericChange || legalHigh) {
            return `Priority review recommended. Validate legal and operational impact for ${primaryType}.`;
        }
        if (financialHigh) {
            return `Priority finance and billing review recommended for ${primaryType}.`;
        }
        if (reputationalHigh) {
            return `Priority policy and communications review recommended for ${primaryType}.`;
        }
        return `High-priority review recommended for ${primaryType}.`;
    }

    if (score >= 40) {
        if (businessImpact === 'medium') {
            return 'Review during the next compliance cycle and confirm whether workflows, notices, or controls need updates.';
        }
        return 'Review and confirm whether downstream processes or published notices require adjustment.';
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
    isFirstSeen = false,
    history = null,
} = {}) {
    const primaryType = policyClassification.primaryType || 'Unknown';
    const verticals = policyClassification.verticals || [];
    const confidence = policyClassification.confidence || 0;

    const classificationDrivers = [
        primaryType !== 'Unknown' ? `Primary classification: ${primaryType}` : null,
        ...verticals.map((vertical) => `Vertical: ${vertical}`),
    ];

    const typeProfile = typeRiskProfile(primaryType);
    const verticalProfile = verticalSensitivity(verticals);

    if (isFirstSeen) {
        const rawBaselineScore = clamp(
            10 +
                round(confidence * 10) +
                classificationWeight(primaryType, verticals) * 0.35 +
                verticalProfile.baseBoost * 0.35,
            5,
            30
        );

        return {
            riskScore: round(rawBaselineScore),
            severity: 'none',
            businessImpact: 'low',
            priority: 'p4',
            reviewWindow: 'baseline_only',
            requiresHumanReview: false,
            recommendedAction: buildRecommendedAction({
                score: rawBaselineScore,
                businessImpact: 'low',
                changeExplanations,
                primaryType,
                isFirstSeen: true,
            }),
            drivers: unique([
                'Initial baseline capture',
                ...classificationDrivers,
            ]),
            baselineMode: true,
            dimensionScores: {
                legal: 0,
                operational: 0,
                financial: 0,
                reputational: 0,
            },
            weightedBreakdown: {
                baseScore: 0,
                classScore: round(classificationWeight(primaryType, verticals) * 0.35),
                explanationScore: 0,
                diffScore: 0,
                confidenceBonus: round(confidence * 10),
                verticalBoost: round(verticalProfile.baseBoost * 0.35),
                trendAdjustment: 0,
            },
        };
    }

    const baseScore = severityToBaseScore(semanticDiff.severity);
    const classScore = classificationWeight(primaryType, verticals);
    const explanationPart = explanationRiskScore(changeExplanations);
    const diffPart = diffRiskScore(semanticDiff);
    const confidenceBonus = round(confidence * 8);

    let trendAdjustment = 0;
    const trendDrivers = [];

    if (history?.recentCriticalCount >= 2) {
        trendAdjustment += 8;
        trendDrivers.push('Repeated critical changes across recent history');
    } else if (history?.recentHighCount >= 2) {
        trendAdjustment += 5;
        trendDrivers.push('Repeated high-severity changes across recent history');
    }

    if (history?.changeFrequency >= 4) {
        trendAdjustment += 6;
        trendDrivers.push('High change frequency detected');
    } else if (history?.changeFrequency >= 2) {
        trendAdjustment += 3;
        trendDrivers.push('Moderate change frequency detected');
    }

    const dimensionScores = combineDimensionScores({
        severity: semanticDiff.severity || 'none',
        explanationDimensions: explanationPart.dimensions,
        diffDimensions: diffPart.dimensions,
        typeProfile,
        verticalProfile,
        confidenceBonus,
    });

    const riskScore = calculateOverallScore({
        baseScore,
        classScore,
        explanationScore: explanationPart.score,
        diffScore: diffPart.score,
        confidenceBonus,
        typeProfile,
        verticalProfile,
        dimensionScores,
    });

    const finalRiskScore = clamp(riskScore + trendAdjustment, 0, 100);
    const businessImpact = determineBusinessImpact(finalRiskScore);
    const priority = determinePriority(finalRiskScore);
    const reviewWindow = determineReviewWindow(finalRiskScore, false);

    const requiresHumanReview =
        finalRiskScore >= 65 ||
        dimensionScores.legal >= 70 ||
        dimensionScores.financial >= 70 ||
        semanticDiff.severity === 'critical';

    const drivers = unique([
        ...explanationPart.drivers,
        ...diffPart.drivers,
        ...classificationDrivers,
        ...trendDrivers,
        finalRiskScore <= 10 ? 'No meaningful change detected' : null,
    ]);

    return {
        riskScore: finalRiskScore,
        severity: semanticDiff.severity || 'none',
        businessImpact,
        priority,
        reviewWindow,
        requiresHumanReview,
        recommendedAction: buildRecommendedAction({
            score: finalRiskScore,
            businessImpact,
            changeExplanations,
            primaryType,
            isFirstSeen: false,
            dimensionScores,
        }),
        drivers,
        baselineMode: false,
        dimensionScores,
        weightedBreakdown: {
            baseScore,
            classScore,
            explanationScore: explanationPart.score,
            diffScore: diffPart.score,
            confidenceBonus,
            verticalBoost: verticalProfile.baseBoost,
            trendAdjustment,
        },
    };
}