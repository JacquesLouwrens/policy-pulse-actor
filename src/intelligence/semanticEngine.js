/**
 * Semantic Engine
 * ----------------
 * Converts raw policy/regulatory text into structured meaning
 */

export function extractSemanticMeaning(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    const normalized = text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const entities = extractEntities(normalized);
    const intents = extractIntents(normalized);
    const domains = extractDomains(normalized);

    return {
        originalText: text,
        normalizedText: normalized,
        entities,
        intents,
        domains,
        extractedAt: new Date().toISOString()
    };
}

/**
 * Detect key policy entities (countries, orgs, actors)
 */
function extractEntities(text) {
    const entityPatterns = [
        { label: 'GOVERNMENT', regex: /\b(ministry|department|government|authority)\b/g },
        { label: 'REGULATOR', regex: /\b(regulator|commission|agency)\b/g },
        { label: 'COUNTRY', regex: /\b(united states|china|eu|european union|south africa)\b/g }
    ];

    return entityPatterns
        .flatMap(({ label, regex }) =>
            [...text.matchAll(regex)].map(match => ({
                type: label,
                value: match[0]
            }))
        );
}

/**
 * Detect intent (ban, allow, restrict, tax, require)
 */
function extractIntents(text) {
    const intentMap = {
        BAN: /\b(ban|prohibit|outlaw)\b/g,
        ALLOW: /\b(allow|permit|approve)\b/g,
        RESTRICT: /\b(restrict|limit|cap)\b/g,
        TAX: /\b(tax|levy|duty)\b/g,
        REQUIRE: /\b(require|mandate|obligate)\b/g
    };

    return Object.entries(intentMap)
        .filter(([, regex]) => regex.test(text))
        .map(([intent]) => intent);
}

/**
 * Detect policy domain
 */
function extractDomains(text) {
    const domains = [];

    if (/\b(ai|artificial intelligence|machine learning)\b/g.test(text)) {
        domains.push('AI');
    }
    if (/\b(crypto|blockchain|digital asset)\b/g.test(text)) {
        domains.push('CRYPTO');
    }
    if (/\b(energy|electricity|carbon|emissions)\b/g.test(text)) {
        domains.push('ENERGY');
    }
    if (/\b(trade|import|export|tariff)\b/g.test(text)) {
        domains.push('TRADE');
    }

    return domains;
}
