import { sendWebhookAlert } from './webhookNotifier.js';
import { formatSlackPayload } from './slackFormatter.js';
import { sendEmailNotification } from './emailNotifier.js';
import {
    formatImmediateEmail,
    formatDigestEmail,
} from './emailFormatter.js';

function normalizeChannels(channels) {
    if (!Array.isArray(channels) || channels.length === 0) {
        return ['slack'];
    }

    return [...new Set(
        channels
            .map((item) => String(item || '').trim().toLowerCase())
            .filter(Boolean)
    )];
}

export function resolveChannelsFromPreferences(preferences = {}) {
    if (Array.isArray(preferences.channels) && preferences.channels.length > 0) {
        return normalizeChannels(preferences.channels);
    }

    return ['slack'];
}

export async function routeImmediateAlert({
    alertPayload,
    preferences = {},
}) {
    const channels = resolveChannelsFromPreferences(preferences);
    const results = {};

    for (const channel of channels) {
        if (channel === 'slack') {
            const webhookUrl = process.env.WEBHOOK_URL || null;

            if (!webhookUrl) {
                results.slack = {
                    attempted: false,
                    skipped: true,
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
            const emailTo =
                preferences.emailTo ||
                process.env.ALERT_EMAIL_TO ||
                null;

            const emailContent = formatImmediateEmail(alertPayload);
            const emailResult = await sendEmailNotification({
                emailTo,
                subject: emailContent.subject,
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
        if (channel === 'slack') {
            const webhookUrl = process.env.WEBHOOK_URL || null;

            if (!webhookUrl) {
                results.slack = {
                    attempted: false,
                    skipped: true,
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
            const emailTo =
                preferences.emailTo ||
                process.env.ALERT_EMAIL_TO ||
                null;

            const emailContent = formatDigestEmail(digestPayload);
            const emailResult = await sendEmailNotification({
                emailTo,
                subject: emailContent.subject,
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
            reason: `Unsupported channel: ${channel}`,
        };
    }

    return {
        channels,
        results,
    };
}