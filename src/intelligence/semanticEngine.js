export function extractSemanticMeaning(text) {
    if (!text || typeof text !== 'string') {
        return {
            topics: [],
            obligations: [],
            permissions: [],
            restrictions: []
        };
    }

    const normalized = text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const topics = [];
    const obligations = [];
    const permissions = [];
    const restrictions = [];

    // --- VERY SIMPLE RULE-BASED EXTRACTION (INTENTIONAL) ---

    if (normalized.includes('artificial intelligence') || normalized.includes('ai')) {
        topics.push('AI processing');
    }

    if (normalized.includes('data')) {
        topics.push('data protection');
    }

    if (normalized.includes('must') || normalized.includes('shall')) {
        obligations.push('mandatory compliance');
    }

    if (normalized.includes('may') || normalized.includes('allowed')) {
        permissions.push('conditional usage');
    }

    if (normalized.includes('restrict') || normalized.includes('prohibit')) {
        restrictions.push('usage restriction');
    }

    // --- RETURN PURE SEMANTIC OBJECT ---

    return {
        topics,
        obligations,
        permissions,
        restrictions
    };
}
