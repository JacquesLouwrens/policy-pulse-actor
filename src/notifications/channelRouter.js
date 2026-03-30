import { sendWebhookAlert } from './webhookNotifier.js';
import { formatSlackPayload } from './slackFormatter.js';
import { sendEmailNotification } from './emailNotifier.js';
import {
    formatImmediateEmail,
    formatDigestEmail,
} from './emailFormatter.js';

function normalizeChannelName(value) {
    return String(value || '').trim().toLowerCase();
}

export function resolveChannelsFromPreferences(preferences = {}) {
    const channels = [];

    if (preferences?.channels?.slack?.enabled) {
        channels.push('slack');
    }

    if (preferences?.channels?.email?.enabled) {
        channels.push('email');
    }

    if (channels.length === 0) {
        return ['log'];
    }

    return [...new Set(channels.map(normalizeChannelName).filter(Boolean))];
}

function resolveEmailRecipients(preferences = {}) {
    const configuredRecipients = preferences?.channels?.email?.to;

    if (Array.isArray(configuredRecipients) && configuredRecipients.length > 0) {
        return configuredRecipients.filter(Boolean).join(',');
    }

    return process.env.ALERT_EMAIL_TO || null;
}

function resolveEmailSubject(subject, preferences = {}) {
    const prefix = preferences?.channels?.email?.subjectPrefix;

    if (!prefix) {
        return subject;
    }

    if (subject.startsWith(prefix)) {
        return subject;
    }

    return `${prefix} ${subject}`.trim();
}

export async function routeImmediateAlert({
    alertPayload,
    preferences = {},
}) {
    const channels = resolveChannelsFromPreferences(preferences);
    const results = {};

    for (const channel of channels) {
        if (channel === 'log') {
            results.log = {
                attempted: false,
                skipped: false,
                success: true,
                reason: 'Log-only routing selected',
            };
            continue;
        }

        if (channel === 'slack') {
            const webhookUrl = process.env.WEBHOOK_URL || null;

            if (!webhookUrl) {
                results.slack = {
                    attempted: false,
                    skipped: true,
                    success: false,
                    reason: 'No webhook URL provided',
                };
                continue;
            }

            const slackPayload = formatSlackPayload(alertPayload);
            const slackResult = await sendWebhookAlert(webhookUrl, slackPayload);

            results.slack = {
                attempted: true,
                renderMode: 'slack_blocks',
                ...slackResult,
            };
            continue;
        }

        if (channel === 'email') {
            const emailTo = resolveEmailRecipients(preferences);

            if (!emailTo) {
                results.email = {
                    attempted: false,
                    skipped: true,
                    success: false,
                    reason: 'No email recipients configured',
                };
                continue;
            }

            const emailContent = formatImmediateEmail(alertPayload);
            const emailResult = await sendEmailNotification({
                emailTo,
                subject: resolveEmailSubject(emailContent.subject, preferences),
                text: emailContent.text,
                html: emailContent.html,
            });

            results.email = {
                attempted: true,
                renderMode: 'email',
                ...emailResult,
            };
            continue;
        }

        results[channel] = {
            attempted: false,
            skipped: true,
            success: false,
            reason: `Unsupported channel: ${channel}`,
        };
    }

    return {
        channels,
        results,
    };
}

export async function routeDigestAlert({
    digestPayload,
    preferences = {},
}) {
    const channels = resolveChannelsFromPreferences(preferences);
    const results = {};

    for (const channel of channels) {
        if (channel === 'log') {
            results.log = {
                attempted: false,
                skipped: false,
                success: true,
                reason: 'Log-only routing selected',
            };
            continue;
        }

        if (channel === 'slack') {
            const webhookUrl = process.env.WEBHOOK_URL || null;

            if (!webhookUrl) {
                results.slack = {
                    attempted: false,
                    skipped: true,
                    success: false,
                    reason: 'No webhook URL provided',
                };
                continue;
            }

            const slackPayload = formatSlackPayload(digestPayload);
            const slackResult = await sendWebhookAlert(webhookUrl, slackPayload);

            results.slack = {
                attempted: true,
                renderMode: 'slack_blocks',
                ...slackResult,
            };
            continue;
        }

        if (channel === 'email') {
            const emailTo = resolveEmailRecipients(preferences);

            if (!emailTo) {
                results.email = {
                    attempted: false,
                    skipped: true,
                    success: false,
                    reason: 'No email recipients configured',
                };
                continue;
            }

            const emailContent = formatDigestEmail(digestPayload);
            const emailResult = await sendEmailNotification({
                emailTo,
                subject: resolveEmailSubject(emailContent.subject, preferences),
                text: emailContent.text,
                html: emailContent.html,
            });

            results.email = {
                attempted: true,
                renderMode: 'email',
                ...emailResult,
            };
            continue;
        }

        results[channel] = {
            attempted: false,
            skipped: true,
            success: false,
            reason: `Unsupported channel: ${channel}`,
        };
    }

    return {
        channels,
        results,
    };
}