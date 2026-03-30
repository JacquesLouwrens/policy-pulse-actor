// STRICT SIGNAL FILTER — Policy Pulse Actor
// Purpose: aggressively suppress low-value signals and only allow meaningful alerts

export function shouldNotify(change = {}, riskAssessment = {}, baseline = {}) {
    const severity = riskAssessment?.severity || "none";
    const riskScore = Number(riskAssessment?.riskScore || 0);
    const businessImpact = riskAssessment?.businessImpact || "low";
    const changeType = change?.changeType || "unknown";
    const classification = change?.classification || null;

    const previousClassification =
        baseline?.lastClassification ||
        baseline?.classification ||
        null;

    const previousChangeType =
        baseline?.lastChangeType ||
        baseline?.changeType ||
        null;

    const conceptCount =
        Array.isArray(change?.newConcepts) ? change.newConcepts.length : 0;

    const driverCount =
        Array.isArray(riskAssessment?.drivers) ? riskAssessment.drivers.length : 0;

    // 1️⃣ Always allow critical / extreme signals
    if (severity === "critical" || riskScore >= 85) {
        return true;
    }

    // 2️⃣ Allow critical business impact (but still require strong score)
    if (businessImpact === "critical" && riskScore >= 70) {
        return true;
    }

    // 3️⃣ Suppress no-change completely
    if (changeType === "no_change") {
        return false;
    }

    // 4️⃣ Suppress low-risk noise
    if (riskScore < 40) {
        return false;
    }

    // 5️⃣ Suppress repeated same-pattern updates
    if (
        previousClassification &&
        classification &&
        previousClassification === classification &&
        previousChangeType &&
        previousChangeType === changeType &&
        riskScore < 65
    ) {
        return false;
    }

    // 6️⃣ Strict gating for moderate signals
    const hasNovelty = conceptCount > 0;
    const hasStrongDrivers = driverCount >= 2;
    const isHighSeverity = severity === "high";
    const isHighImpact =
        businessImpact === "high" || businessImpact === "critical";

    if (
        riskScore >= 65 &&
        (
            hasNovelty ||
            hasStrongDrivers ||
            isHighSeverity ||
            isHighImpact
        )
    ) {
        return true;
    }

    // 7️⃣ Default strict suppression
    return false;
}


export function getSignalDecision(change = {}, riskAssessment = {}, baseline = {}) {
    const severity = riskAssessment?.severity || "none";
    const riskScore = Number(riskAssessment?.riskScore || 0);
    const businessImpact = riskAssessment?.businessImpact || "low";
    const changeType = change?.changeType || "unknown";
    const classification = change?.classification || null;

    const previousClassification =
        baseline?.lastClassification ||
        baseline?.classification ||
        null;

    const previousChangeType =
        baseline?.lastChangeType ||
        baseline?.changeType ||
        null;

    const conceptCount =
        Array.isArray(change?.newConcepts) ? change.newConcepts.length : 0;

    const driverCount =
        Array.isArray(riskAssessment?.drivers) ? riskAssessment.drivers.length : 0;

    // 1️⃣ Critical override
    if (severity === "critical" || riskScore >= 85) {
        return { notify: true, reason: "critical_or_extreme_risk" };
    }

    // 2️⃣ Critical business impact
    if (businessImpact === "critical" && riskScore >= 70) {
        return { notify: true, reason: "critical_business_impact" };
    }

    // 3️⃣ No change
    if (changeType === "no_change") {
        return { notify: false, reason: "no_change" };
    }

    // 4️⃣ Low risk suppression
    if (riskScore < 40) {
        return { notify: false, reason: "low_risk" };
    }

    // 5️⃣ Repeated pattern suppression
    if (
        previousClassification &&
        classification &&
        previousClassification === classification &&
        previousChangeType &&
        previousChangeType === changeType &&
        riskScore < 65
    ) {
        return { notify: false, reason: "repeated_pattern" };
    }

    // 6️⃣ Strict moderate signal gate
    const hasNovelty = conceptCount > 0;
    const hasStrongDrivers = driverCount >= 2;
    const isHighSeverity = severity === "high";
    const isHighImpact =
        businessImpact === "high" || businessImpact === "critical";

    if (
        riskScore >= 65 &&
        (
            hasNovelty ||
            hasStrongDrivers ||
            isHighSeverity ||
            isHighImpact
        )
    ) {
        return { notify: true, reason: "material_signal" };
    }

    // 7️⃣ Default strict suppression
    return { notify: false, reason: "strict_suppression" };
}