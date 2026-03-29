function truncate(text, max = 2800) {
    if (!text || typeof text !== 'string') return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

function slackEscape(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function slackLink(url, label = 'View policy') {
    const safeUrl = String(url || '').trim();
    const safeLabel = slackEscape(label || 'View policy');

    if (!safeUrl) return safeLabel;
    return `<${safeUrl}|${safeLabel}>`;
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

function priorityRank(priority = 'p4') {
    switch (priority) {
        case 'p0':
            return 0;
        case 'p1':
            return 1;
        case 'p2':
            return 2;
        case 'p3':
            return 3;
        default:
            return 4;
    }
}

function businessImpactRank(impact = 'low') {
    switch (impact) {
        case 'critical':
            return 0;
        case 'high':
            return 1;
        case 'medium':
            return 2;
        default:
            return 3;
    }
}

function buildDriverList(drivers = [], max = 3) {
    const items = safeArray(drivers, max);
    if (!items.length) return '• No top drivers supplied';

    return items
        .map((item) => `• ${slackEscape(item)}`)
        .join('\n');
}

function buildImmediateSlackPayload(alertPayload = {}) {
    const priority = alertPayload.priority || 'p4';
    const severity = alertPayload.severity || 'none';
    const icon = emojiForPriority(priority);
    const severityIcon = emojiForSeverity(severity);
    const driverText = buildDriverList(alertPayload.topDrivers, 3);

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
                    { type: 'mrkdwn', text: `*Priority*\n${slackEscape(priority.toUpperCase())}` },
                    { type: 'mrkdwn', text: `*Severity*\n${severityIcon} ${slackEscape(severity.toUpperCase())}` },
                    { type: 'mrkdwn', text: `*Risk Score*\n${slackEscape(alertPayload.riskScore ?? 0)}` },
                    { type: 'mrkdwn', text: `*Business Impact*\n${slackEscape((alertPayload.businessImpact || 'low').toUpperCase())}` },
                    { type: 'mrkdwn', text: `*Review Window*\n${slackEscape(alertPayload.reviewWindow || 'monitor')}` },
                    { type: 'mrkdwn', text: `*Human Review*\n${alertPayload.requiresHumanReview ? 'Yes' : 'No'}` },
                ],
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Summary*\n${truncate(slackEscape(alertPayload.message || 'No summary provided.'), 1000)}`,
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
                    text: `*Recommended Action*\n${truncate(slackEscape(alertPayload.recommendedAction || 'No action provided.'), 1000)}`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text:
                            `*Policy Type:* ${slackEscape(alertPayload.primaryType || 'Unknown')} | ` +
                            `*Link:* ${slackLink(alertPayload.url, 'Open policy')}`,
                    },
                ],
            },
        ],
    };
}

function buildDigestEntry(entry = {}) {
    const icon = emojiForPriority(entry.priority || 'p4');
    const drivers = safeArray(entry.topDrivers, 2)
        .map((item) => slackEscape(item))
        .join(', ') || 'No top drivers';

    const line =
        `${icon} *${truncate(slackEscape(entry.headline || 'Policy update'), 120)}*\n` +
        `• Priority: ${slackEscape((entry.priority || 'p4').toUpperCase())} | ` +
        `Severity: ${slackEscape((entry.severity || 'none').toUpperCase())} | ` +
        `Impact: ${slackEscape((entry.businessImpact || 'low').toUpperCase())}\n` +
        `• Review: ${slackEscape(entry.reviewWindow || 'monitor')}\n` +
        `• Drivers: ${truncate(drivers, 180)}\n` +
        `• Action: ${truncate(slackEscape(entry.recommendedAction || 'No action provided.'), 220)}\n` +
        `• ${slackLink(entry.url, 'Open policy')}`;

    return {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: truncate(line, 2900),
        },
    };
}

function buildUrgentBadgeLine(topUrgentItem = null) {
    if (!topUrgentItem) {
        return '• Top urgent: none';
    }

    const priorityIcon = emojiForPriority(topUrgentItem.priority || 'p4');
    const review = slackEscape(topUrgentItem.reviewWindow || 'monitor');
    const impact = slackEscape((topUrgentItem.businessImpact || 'low').toUpperCase());
    const priority = slackEscape((topUrgentItem.priority || 'p4').toUpperCase());
    const humanReview = topUrgentItem.requiresHumanReview ? ' · Human review' : '';

    return `• Top urgent: ${priorityIcon} ${priority} · ${impact} · ${review}${humanReview}`;
}

function buildPolicyTypeGroupHeader(group = {}) {
    const icon = emojiForPriority(group.highestPriority || 'p4');
    const summary = group.summary || {};
    const impact = group.businessImpactSummary || {};
    const urgentBadge = buildUrgentBadgeLine(group.topUrgentItem);

    const text =
        `${icon} *${slackEscape(group.primaryType || 'Unknown')}*\n` +
        `${urgentBadge}\n` +
        `• Alerts: ${slackEscape(group.itemCount ?? 0)} | ` +
        `Highest: ${slackEscape((group.highestPriority || 'p4').toUpperCase())}\n` +
        `• P0/P1/P2/P3/P4: ` +
        `${slackEscape(summary.p0 ?? 0)}/` +
        `${slackEscape(summary.p1 ?? 0)}/` +
        `${slackEscape(summary.p2 ?? 0)}/` +
        `${slackEscape(summary.p3 ?? 0)}/` +
        `${slackEscape(summary.p4 ?? 0)}\n` +
        `• Impact C/H/M/L: ` +
        `${slackEscape(impact.critical ?? 0)}/` +
        `${slackEscape(impact.high ?? 0)}/` +
        `${slackEscape(impact.medium ?? 0)}/` +
        `${slackEscape(impact.low ?? 0)}`;

    return {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text,
        },
    };
}

function flattenUrgentEntries(groupedEntries = []) {
    return groupedEntries
        .flatMap((group) =>
            (group.entries || []).map((entry) => ({
                ...entry,
                groupPrimaryType: group.primaryType || entry.primaryType || 'Unknown',
            }))
        )
        .sort((a, b) => {
            const priorityCompare = priorityRank(a.priority) - priorityRank(b.priority);
            if (priorityCompare !== 0) return priorityCompare;

            const aTime = new Date(a.queuedAt || 0).getTime();
            const bTime = new Date(b.queuedAt || 0).getTime();
            return aTime - bTime;
        });
}

function buildUrgentDigestSection(groupedEntries = []) {
    const urgentEntries = flattenUrgentEntries(groupedEntries)
        .filter((entry) => priorityRank(entry.priority) <= 1)
        .slice(0, 3);

    if (!urgentEntries.length) {
        return [];
    }

    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '*Top Urgent Items*',
            },
        },
    ];

    for (const entry of urgentEntries) {
        const icon = emojiForPriority(entry.priority || 'p4');
        const text =
            `${icon} *${truncate(slackEscape(entry.headline || 'Policy update'), 110)}*\n` +
            `• Type: ${slackEscape(entry.groupPrimaryType || entry.primaryType || 'Unknown')} | ` +
            `Priority: ${slackEscape((entry.priority || 'p4').toUpperCase())} | ` +
            `Impact: ${slackEscape((entry.businessImpact || 'low').toUpperCase())}\n` +
            `• Action: ${truncate(slackEscape(entry.recommendedAction || 'No action provided.'), 180)}\n` +
            `• ${slackLink(entry.url, 'Open policy')}`;

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncate(text, 2800),
            },
        });
    }

    blocks.push({ type: 'divider' });
    return blocks;
}

function buildBusinessImpactSummarySection(businessImpactSummary = {}) {
    return [
        {
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `*Impact Critical / High*\n${slackEscape(businessImpactSummary.critical ?? 0)} / ${slackEscape(businessImpactSummary.high ?? 0)}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Impact Medium / Low*\n${slackEscape(businessImpactSummary.medium ?? 0)} / ${slackEscape(businessImpactSummary.low ?? 0)}`,
                },
            ],
        },
        {
            type: 'divider',
        },
    ];
}

function isLowSignalGroup(group = {}) {
    const highestPriority = group.highestPriority || 'p4';
    const highestBusinessImpact = group.highestBusinessImpact || 'low';
    const topUrgentItem = group.topUrgentItem || null;

    const hasHumanReview = Boolean(topUrgentItem?.requiresHumanReview);
    const urgentReviewWindow =
        topUrgentItem?.reviewWindow === 'immediate' ||
        topUrgentItem?.reviewWindow === '24h';

    return (
        priorityRank(highestPriority) >= 3 &&
        businessImpactRank(highestBusinessImpact) >= 2 &&
        !hasHumanReview &&
        !urgentReviewWindow
    );
}

function splitGroupsBySignal(groupedEntries = []) {
    const expandedGroups = [];
    const collapsedGroups = [];

    for (const group of groupedEntries) {
        if (isLowSignalGroup(group)) {
            collapsedGroups.push(group);
        } else {
            expandedGroups.push(group);
        }
    }

    return { expandedGroups, collapsedGroups };
}

function buildCollapsedReason(group = {}) {
    const reasons = [];
    const highestPriority = group.highestPriority || 'p4';
    const highestBusinessImpact = group.highestBusinessImpact || 'low';
    const topUrgentItem = group.topUrgentItem || null;

    if (priorityRank(highestPriority) >= 3) {
        reasons.push('low priority');
    }

    if (businessImpactRank(highestBusinessImpact) >= 2) {
        reasons.push(highestBusinessImpact === 'medium' ? 'moderate impact' : 'low impact');
    }

    if (!topUrgentItem?.requiresHumanReview) {
        reasons.push('no human review');
    }

    const urgentReviewWindow =
        topUrgentItem?.reviewWindow === 'immediate' ||
        topUrgentItem?.reviewWindow === '24h';

    if (!urgentReviewWindow) {
        reasons.push('no urgent review');
    }

    if (!reasons.length) {
        return 'collapsed: low signal group';
    }

    return `collapsed: ${reasons.slice(0, 3).join(', ')}`;
}

function buildCollapsedGroupSummaryLine(group = {}) {
    const icon = emojiForPriority(group.highestPriority || 'p4');
    const impact = group.highestBusinessImpact || 'low';
    const collapseReason = buildCollapsedReason(group);

    const text =
        `${icon} *${slackEscape(group.primaryType || 'Unknown')}* — ` +
        `${slackEscape(group.itemCount ?? 0)} alerts · ` +
        `highest ${slackEscape((group.highestPriority || 'p4').toUpperCase())} · ` +
        `impact ${slackEscape(String(impact).toUpperCase())}\n` +
        `_${slackEscape(collapseReason)}_`;

    return {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text,
        },
    };
}

function buildCollapsedGroupsSection(collapsedGroups = []) {
    if (!collapsedGroups.length) {
        return [];
    }

    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '*Collapsed Low-Signal Groups*',
            },
        },
    ];

    for (const group of collapsedGroups.slice(0, 8)) {
        blocks.push(buildCollapsedGroupSummaryLine(group));
    }

    if (collapsedGroups.length > 8) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Showing first 8 of ${slackEscape(collapsedGroups.length)} collapsed low-signal groups.`,
                },
            ],
        });
    }

    blocks.push({ type: 'divider' });
    return blocks;
}

function entryCapForGroup(group = {}) {
    const highestPriority = group.highestPriority || 'p4';
    const highestBusinessImpact = group.highestBusinessImpact || 'low';
    const topUrgentItem = group.topUrgentItem || null;

    if (
        highestPriority === 'p0' ||
        highestBusinessImpact === 'critical' ||
        topUrgentItem?.reviewWindow === 'immediate'
    ) {
        return 6;
    }

    if (
        highestPriority === 'p1' ||
        highestBusinessImpact === 'high' ||
        topUrgentItem?.reviewWindow === '24h'
    ) {
        return 5;
    }

    if (
        highestPriority === 'p2' ||
        highestBusinessImpact === 'medium'
    ) {
        return 4;
    }

    return 3;
}

function buildGroupOverflowSummary(group = {}, shownCount = 0) {
    const total = Number(group.itemCount || 0);
    const remaining = total - shownCount;

    if (remaining <= 0) {
        return [];
    }

    return [
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text:
                        `Showing ${slackEscape(shownCount)} of ${slackEscape(total)} items in ` +
                        `*${slackEscape(group.primaryType || 'Unknown')}*. ` +
                        `${slackEscape(remaining)} additional item${remaining === 1 ? '' : 's'} not shown.`,
                },
            ],
        },
        {
            type: 'divider',
        },
    ];
}

function buildGroupedDigestBlocks(groupedEntries = []) {
    const blocks = [];
    let visibleEntriesShown = 0;
    let hiddenEntriesNotShown = 0;

    for (const group of groupedEntries.slice(0, 8)) {
        blocks.push(buildPolicyTypeGroupHeader(group));

        const cap = entryCapForGroup(group);
        const visibleEntries = (group.entries || []).slice(0, cap);
        const hiddenCount = Math.max((group.itemCount || 0) - visibleEntries.length, 0);

        visibleEntriesShown += visibleEntries.length;
        hiddenEntriesNotShown += hiddenCount;

        for (const entry of visibleEntries) {
            blocks.push(buildDigestEntry(entry));
        }

        blocks.push(...buildGroupOverflowSummary(group, visibleEntries.length));

        if ((group.itemCount || 0) <= visibleEntries.length) {
            blocks.push({ type: 'divider' });
        }
    }

    return {
        blocks,
        visibleEntriesShown,
        hiddenEntriesNotShown,
    };
}

function buildDigestFooterRollup({
    expandedGroupCount = 0,
    collapsedGroupCount = 0,
    visibleEntriesShown = 0,
    hiddenEntriesNotShown = 0,
}) {
    return [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '*Digest Rollup*',
            },
        },
        {
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `*Expanded Groups*\n${slackEscape(expandedGroupCount)}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Collapsed Groups*\n${slackEscape(collapsedGroupCount)}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Visible Entries Shown*\n${slackEscape(visibleEntriesShown)}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Hidden Entries Not Shown*\n${slackEscape(hiddenEntriesNotShown)}`,
                },
            ],
        },
    ];
}

function buildDigestSlackPayload(digestPayload = {}) {
    const summary = digestPayload.summary || {};
    const businessImpactSummary = digestPayload.businessImpactSummary || {};
    const groupedEntries = Array.isArray(digestPayload.groupedEntries)
        ? digestPayload.groupedEntries
        : [];
    const entries = Array.isArray(digestPayload.entries) ? digestPayload.entries : [];
    const highest = digestPayload.highestPriority || 'p4';
    const icon = emojiForPriority(highest);

    const { expandedGroups, collapsedGroups } = splitGroupsBySignal(groupedEntries);
    const expandedRender = buildGroupedDigestBlocks(expandedGroups);

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
                    text: `*Highest Priority*\n${slackEscape(highest.toUpperCase())}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Items*\n${slackEscape(digestPayload.itemCount ?? entries.length)}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Trigger*\n${slackEscape(digestPayload.trigger || 'scheduled')}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Window*\n${slackEscape(summary.windowMinutes ?? 'N/A')} min`,
                },
                {
                    type: 'mrkdwn',
                    text: `*P0 / P1*\n${slackEscape(summary.p0 ?? 0)} / ${slackEscape(summary.p1 ?? 0)}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*P2 / P3 / P4*\n${slackEscape(summary.p2 ?? 0)} / ${slackEscape(summary.p3 ?? 0)} / ${slackEscape(summary.p4 ?? 0)}`,
                },
            ],
        },
        {
            type: 'divider',
        },
        ...buildBusinessImpactSummarySection(businessImpactSummary),
    ];

    if (groupedEntries.length > 0) {
        blocks.push(...buildUrgentDigestSection(expandedGroups.length ? expandedGroups : groupedEntries));
        blocks.push(...expandedRender.blocks);
        blocks.push(...buildCollapsedGroupsSection(collapsedGroups));
        blocks.push(
            ...buildDigestFooterRollup({
                expandedGroupCount: expandedGroups.length,
                collapsedGroupCount: collapsedGroups.length,
                visibleEntriesShown: expandedRender.visibleEntriesShown,
                hiddenEntriesNotShown: expandedRender.hiddenEntriesNotShown,
            })
        );
    } else {
        for (const entry of entries.slice(0, 10)) {
            blocks.push(buildDigestEntry(entry));
            blocks.push({ type: 'divider' });
        }
    }

    if (expandedGroups.length > 8) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Showing first 8 expanded policy-type groups of ${slackEscape(expandedGroups.length)} total expanded groups.`,
                },
            ],
        });
    } else if (entries.length > 10 && groupedEntries.length === 0) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Showing first 10 of ${slackEscape(entries.length)} digest items.`,
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