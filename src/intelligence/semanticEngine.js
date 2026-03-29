export function extractSemanticMeaning(text) {
    if (!text || typeof text !== 'string') {
        return {
            topics: [],
            obligations: [],
            permissions: [],
            restrictions: [],
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

    // Helper: only add unique values
    function pushUnique(array, value) {
        if (!array.includes(value)) {
            array.push(value);
        }
    }

    // --- IMPROVED RULE-BASED EXTRACTION ---

    // Topics
    if (
        /\bartificial intelligence\b/.test(normalized) ||
        /\bai\b/.test(normalized) ||
        /\bmachine learning\b/.test(normalized) ||
        /\bautomated decision(?:-making)?\b/.test(normalized)
    ) {
        pushUnique(topics, 'AI processing');
    }

    if (
        /\bdata protection\b/.test(normalized) ||
        /\bpersonal data\b/.test(normalized) ||
        /\bprivacy\b/.test(normalized) ||
        /\bdata\b/.test(normalized)
    ) {
        pushUnique(topics, 'data protection');
    }

    if (
        /\bcookies\b/.test(normalized) ||
        /\btracking\b/.test(normalized) ||
        /\banalytics\b/.test(normalized)
    ) {
        pushUnique(topics, 'tracking and cookies');
    }

    if (
        /\bsecurity\b/.test(normalized) ||
        /\bencryption\b/.test(normalized) ||
        /\bbreach\b/.test(normalized)
    ) {
        pushUnique(topics, 'security controls');
    }

    // Obligations
    if (/\bmust\b/.test(normalized) || /\bshall\b/.test(normalized) || /\brequired to\b/.test(normalized)) {
        pushUnique(obligations, 'mandatory compliance');
    }

    if (
        /\bimplement\b/.test(normalized) ||
        /\bmaintain\b/.test(normalized) ||
        /\bensure\b/.test(normalized)
    ) {
        pushUnique(obligations, 'operational obligation');
    }

    // Permissions
    if (
        /\bmay\b/.test(normalized) ||
        /\ballowed\b/.test(normalized) ||
        /\bpermitted\b/.test(normalized)
    ) {
        pushUnique(permissions, 'conditional usage');
    }

    if (
        /\bcan\b/.test(normalized) ||
        /\bauthorized\b/.test(normalized)
    ) {
        pushUnique(permissions, 'authorized activity');
    }

    // Restrictions
    if (
        /\brestrict\b/.test(normalized) ||
        /\bprohibit\b/.test(normalized) ||
        /\bforbidden\b/.test(normalized) ||
        /\bnot allowed\b/.test(normalized)
    ) {
        pushUnique(restrictions, 'usage restriction');
    }

    if (
        /\bwithout consent\b/.test(normalized) ||
        /\bunless required by law\b/.test(normalized)
    ) {
        pushUnique(restrictions, 'conditional prohibition');
    }

    return {
        topics,
        obligations,
        permissions,
        restrictions,
    };
}