export function classifyPolicyType(text, url = '') {
    if (!text || typeof text !== 'string') {
        return {
            primaryType: 'Unknown',
            secondaryTypes: [],
            verticals: [],
            confidence: 0,
            matches: [],
        };
    }

    const normalized = `${url} ${text}`
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const rules = [
        {
            type: 'Privacy Policy',
            vertical: 'Privacy',
            weight: 10,
            patterns: [
                /\bprivacy policy\b/,
                /\bprivacy notice\b/,
                /\bprivacy statement\b/,
                /\bpersonal data\b/,
                /\bdata subject\b/,
            ],
        },
        {
            type: 'Cookie Policy',
            vertical: 'Privacy',
            weight: 8,
            patterns: [
                /\bcookie policy\b/,
                /\bcookies\b/,
                /\btracking technologies\b/,
                /\btracking cookies\b/,
            ],
        },
        {
            type: 'Terms of Service',
            vertical: 'SaaS',
            weight: 8,
            patterns: [
                /\bterms of service\b/,
                /\bterms of use\b/,
                /\buser agreement\b/,
                /\bservice terms\b/,
            ],
        },
        {
            type: 'Data Protection Guidance',
            vertical: 'Privacy',
            weight: 9,
            patterns: [
                /\bdata protection\b/,
                /\bgdpr\b/,
                /\bccpa\b/,
                /\bprocessing of personal data\b/,
                /\bcontroller\b/,
                /\bprocessor\b/,
            ],
        },
        {
            type: 'Financial Regulation',
            vertical: 'Banking\/FinTech',
            weight: 10,
            patterns: [
                /\bfinancial regulation\b/,
                /\bfinancial services\b/,
                /\banti-money laundering\b/,
                /\baml\b/,
                /\bknow your customer\b/,
                /\bkyc\b/,
                /\bpayment services\b/,
                /\bbanking\b/,
                /\bfintech\b/,
            ],
        },
        {
            type: 'Healthcare Compliance',
            vertical: 'Healthcare',
            weight: 10,
            patterns: [
                /\bhipaa\b/,
                /\bprotected health information\b/,
                /\bphi\b/,
                /\bhealthcare\b/,
                /\bmedical records\b/,
                /\bpatient data\b/,
            ],
        },
        {
            type: 'Tax / VAT',
            vertical: 'Tax',
            weight: 10,
            patterns: [
                /\bvat\b/,
                /\bvalue-added tax\b/,
                /\bvalue added tax\b/,
                /\btax compliance\b/,
                /\btax law\b/,
                /\btax authority\b/,
                /\bincome tax\b/,
            ],
        },
        {
            type: 'AI Governance',
            vertical: 'AI',
            weight: 10,
            patterns: [
                /\bartificial intelligence\b/,
                /\bai systems\b/,
                /\bai governance\b/,
                /\bautomated decision-making\b/,
                /\bmachine learning\b/,
                /\balgorithmic accountability\b/,
            ],
        },
    ];

    const scored = [];
    const matches = [];

    for (const rule of rules) {
        let score = 0;
        const matchedPatterns = [];

        for (const pattern of rule.patterns) {
            if (pattern.test(normalized)) {
                score += rule.weight;
                matchedPatterns.push(pattern.source);
            }
        }

        if (score > 0) {
            scored.push({
                type: rule.type,
                vertical: rule.vertical,
                score,
            });

            matches.push({
                type: rule.type,
                vertical: rule.vertical,
                matchedPatterns,
                score,
            });
        }
    }

    scored.sort((a, b) => b.score - a.score);

    const primaryType = scored[0]?.type || 'Unknown';
    const maxScore = scored[0]?.score || 0;

    const secondaryTypes = scored
        .slice(1)
        .map((item) => item.type)
        .filter((type) => type !== primaryType);

    const verticals = [...new Set(scored.map((item) => item.vertical))];

    let confidence = 0;
    if (maxScore >= 30) confidence = 0.95;
    else if (maxScore >= 20) confidence = 0.85;
    else if (maxScore >= 10) confidence = 0.7;
    else if (maxScore > 0) confidence = 0.55;

    return {
        primaryType,
        secondaryTypes,
        verticals,
        confidence,
        matches,
    };
}
