function truncate(text, max = 2800) {
    if (!text || typeof text !== 'string') return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

function emojiForPriority(priority = 'p4') {
    switch (priority) {
        case 'p0':
            return '🚨';
        case 'p1':
            return '⚠️';
        case 'p2':
            return '🟠';
        case 'p3':
            return '🟡';
        default:
            return '🔹';
    }
}

function emojiForSeverity(severity = 'none') {
    switch (severity) {
        case 'critical':
            return '🚨';
        case 'high':
            return '⚠️';
        case 'medium':
            return '🟠';
        case 'low':
            return '🟡';
        default:
            return '🔹';
    }
}

function safeArray(values, max = 3) {
    if (!Array.isArray(values)) return [];
    return values.filter(Boolean).slice(0, max);
}

function buildImmediateSlackPayload(alertPayload = {}) {
    const priority = alertPayload.priority || 'p4';
    const severity = alertPayload.severity || 'none';
    const icon = emojiForPriority(priority);

    const driverText = safeArray(alertPayload.topDrivers, 3)
        .map((item) => `• ${item}`)
        .join('\n') || '• No top drivers supplied';

    const fallbackText =
        `${icon} ${alertPayload.headline || 'Policy alert'} ` +
        `(${priority.toUpperCase()}, risk ${alertPayload.riskScore ?? 0})`;

    return {
        text: fallbackText,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${icon} ${truncate(alertPayload.headline || 'Policy alert', 140)}`,
                    emoji: true,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Priority*\n${priority.toUpperCase()}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Severity*\n${severity.toUpperCase()}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Risk Score*\n${alertPayload.riskScore ?? 0}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Business Impact*\n${(alertPayload.businessImpact || 'low').toUpperCase()}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Review Window*\n${alertPayload.reviewWindow || 'monitor'}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Human Review*\n${alertPayload.requiresHumanReview ? 'Yes' : 'No'}`,
                    },
                ],
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Summary*\n${truncate(alertPayload.message || 'No summary provided.', 1000)}`,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Top Drivers*\n${truncate(driverText, 900)}`,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Recommended Action*\n${truncate(alertPayload.recommendedAction || 'No action provided.', 1000)}`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `*Policy Type:* ${alertPayload.primaryType || 'Unknown'} | *URL:* ${alertPayload.url || 'N/A'}`,
                    },
                ],
            },
        ],
    };
}

function buildDigestEntry(entry = {}) {
    const icon = emojiForPriority(entry.priority || 'p4');
    const drivers = safeArray(entry.topDrivers, 2).join(', ') || 'No top drivers';
    const line =
        `${icon} *${truncate(entry.headline || 'Policy update', 120)}*\n` +
        `• Priority: ${(entry.priority || 'p4').toUpperCase()} | ` +
        `Severity: ${(entry.severity || 'none').toUpperCase()} | ` +
        `Impact: ${(entry.businessImpact || 'low').toUpperCase()}\n` +
        `• Type: ${entry.primaryType || 'Unknown'} | Review: ${entry.reviewWindow || 'monitor'}\n` +
        `• Drivers: ${truncate(drivers, 180)}\n` +
        `• Action: ${truncate(entry.recommendedAction || 'No action provided.', 220)}\n` +
        `• URL: ${entry.url || 'N/A'}`;

    return {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: truncate(line, 2900),
        },
    };
}

function buildDigestSlackPayload(digestPayload = {}) {
    const summary = digestPayload.summary || {};
    const entries = Array.isArray(digestPayload.entries) ? digestPayload.entries : [];
    const highest = digestPayload.highestPriority || 'p4';
    const icon = emojiForPriority(highest);

    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `${icon} ${truncate(digestPayload.headline || 'Policy Pulse Digest', 140)}`,
                emoji: true,
            },
        },
        {
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `*Highest Priority*\n${highest.toUpperCase()}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Items*\n${digestPayload.itemCount ?? entries.length}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Trigger*\n${digestPayload.trigger || 'scheduled'}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Window*\n${summary.windowMinutes ?? 'N/A'} min`,
                },
                {
                    type: 'mrkdwn',
                    text: `*P0 / P1*\n${summary.p0 ?? 0} / ${summary.p1 ?? 0}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*P2 / P3 / P4*\n${summary.p2 ?? 0} / ${summary.p3 ?? 0} / ${summary.p4 ?? 0}`,
                },
            ],
        },
        {
            type: 'divider',
        },
    ];

    for (const entry of entries.slice(0, 10)) {
        blocks.push(buildDigestEntry(entry));
        blocks.push({ type: 'divider' });
    }

    if (entries.length > 10) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Showing first 10 of ${entries.length} digest items.`,
                },
            ],
        });
    }

    const fallbackText =
        `${icon} ${digestPayload.headline || 'Policy Pulse Digest'} ` +
        `(${digestPayload.itemCount ?? entries.length} items)`;

    return {
        text: fallbackText,
        blocks,
    };
}

export function formatSlackPayload(payload = {}) {
    if (payload?.mode === 'digest') {
        return buildDigestSlackPayload(payload);
    }

    return buildImmediateSlackPayload(payload);
}