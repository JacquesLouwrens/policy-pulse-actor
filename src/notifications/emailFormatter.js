function safe(value) {
    return value === null || value === undefined ? '' : String(value);
}

function list(items = [], max = 5) {
    if (!Array.isArray(items) || items.length === 0) {
        return '- None';
    }

    return items.slice(0, max).map((item) => `- ${safe(item)}`).join('\n');
}

export function formatEmailSubject(payload = {}) {
    const priority = safe(payload.priority || 'p4').toUpperCase();
    const primaryType = safe(payload.primaryType || 'Policy Update');
    return `[${priority}] ${primaryType} alert`;
}

export function formatImmediateEmail(payload = {}) {
    const subject = formatEmailSubject(payload);

    const text = [
        `${safe(payload.headline || 'Policy alert')}`,
        '',
        `Priority: ${safe(payload.priority || 'p4').toUpperCase()}`,
        `Severity: ${safe(payload.severity || 'none').toUpperCase()}`,
        `Risk Score: ${safe(payload.riskScore ?? 0)}`,
        `Business Impact: ${safe(payload.businessImpact || 'low').toUpperCase()}`,
        `Review Window: ${safe(payload.reviewWindow || 'monitor')}`,
        `Human Review: ${payload.requiresHumanReview ? 'Yes' : 'No'}`,
        `Policy Type: ${safe(payload.primaryType || 'Unknown')}`,
        `URL: ${safe(payload.url || 'N/A')}`,
        '',
        'Summary:',
        safe(payload.message || 'No summary provided.'),
        '',
        'Top Drivers:',
        list(payload.topDrivers, 5),
        '',
        'Recommended Action:',
        safe(payload.recommendedAction || 'No action provided.'),
    ].join('\n');

    const html = `
        <h2>${safe(payload.headline || 'Policy alert')}</h2>
        <p><strong>Priority:</strong> ${safe(payload.priority || 'p4').toUpperCase()}<br/>
        <strong>Severity:</strong> ${safe(payload.severity || 'none').toUpperCase()}<br/>
        <strong>Risk Score:</strong> ${safe(payload.riskScore ?? 0)}<br/>
        <strong>Business Impact:</strong> ${safe(payload.businessImpact || 'low').toUpperCase()}<br/>
        <strong>Review Window:</strong> ${safe(payload.reviewWindow || 'monitor')}<br/>
        <strong>Human Review:</strong> ${payload.requiresHumanReview ? 'Yes' : 'No'}<br/>
        <strong>Policy Type:</strong> ${safe(payload.primaryType || 'Unknown')}<br/>
        <strong>URL:</strong> ${safe(payload.url || 'N/A')}</p>
        <h3>Summary</h3>
        <p>${safe(payload.message || 'No summary provided.')}</p>
        <h3>Top Drivers</h3>
        <pre>${safe(list(payload.topDrivers, 5))}</pre>
        <h3>Recommended Action</h3>
        <p>${safe(payload.recommendedAction || 'No action provided.')}</p>
    `;

    return { subject, text, html };
}

export function formatDigestEmail(digestPayload = {}) {
    const entries = Array.isArray(digestPayload.entries) ? digestPayload.entries : [];
    const subject = `[DIGEST] ${safe(digestPayload.headline || 'Policy Pulse Digest')}`;

    const entryText = entries.slice(0, 20).map((entry, index) => {
        return [
            `${index + 1}. ${safe(entry.headline || 'Policy update')}`,
            `   Priority: ${safe(entry.priority || 'p4').toUpperCase()} | Severity: ${safe(entry.severity || 'none').toUpperCase()} | Impact: ${safe(entry.businessImpact || 'low').toUpperCase()}`,
            `   Policy Type: ${safe(entry.primaryType || 'Unknown')}`,
            `   Review Window: ${safe(entry.reviewWindow || 'monitor')}`,
            `   URL: ${safe(entry.url || 'N/A')}`,
            `   Action: ${safe(entry.recommendedAction || 'No action provided.')}`,
        ].join('\n');
    }).join('\n\n');

    const text = [
        safe(digestPayload.headline || 'Policy Pulse Digest'),
        '',
        `Trigger: ${safe(digestPayload.trigger || 'scheduled')}`,
        `Item Count: ${safe(digestPayload.itemCount ?? entries.length)}`,
        `Highest Priority: ${safe(digestPayload.highestPriority || 'p4').toUpperCase()}`,
        '',
        'Entries:',
        entryText || '- No digest entries',
    ].join('\n');

    const entryHtml = entries.slice(0, 20).map((entry, index) => `
        <li>
            <strong>${index + 1}. ${safe(entry.headline || 'Policy update')}</strong><br/>
            Priority: ${safe(entry.priority || 'p4').toUpperCase()} |
            Severity: ${safe(entry.severity || 'none').toUpperCase()} |
            Impact: ${safe(entry.businessImpact || 'low').toUpperCase()}<br/>
            Policy Type: ${safe(entry.primaryType || 'Unknown')}<br/>
            Review Window: ${safe(entry.reviewWindow || 'monitor')}<br/>
            URL: ${safe(entry.url || 'N/A')}<br/>
            Action: ${safe(entry.recommendedAction || 'No action provided.')}
        </li>
    `).join('');

    const html = `
        <h2>${safe(digestPayload.headline || 'Policy Pulse Digest')}</h2>
        <p><strong>Trigger:</strong> ${safe(digestPayload.trigger || 'scheduled')}<br/>
        <strong>Item Count:</strong> ${safe(digestPayload.itemCount ?? entries.length)}<br/>
        <strong>Highest Priority:</strong> ${safe(digestPayload.highestPriority || 'p4').toUpperCase()}</p>
        <h3>Entries</h3>
        <ol>${entryHtml || '<li>No digest entries</li>'}</ol>
    `;

    return { subject, text, html };
}