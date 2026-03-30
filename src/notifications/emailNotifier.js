export async function sendEmailNotification({
    emailTo,
    subject,
    text,
    html = null,
}) {
    if (!emailTo) {
        return { skipped: true, reason: 'No email recipient configured' };
    }

    const provider = process.env.EMAIL_PROVIDER || 'log-only';

    if (provider === 'log-only') {
        console.log('EMAIL_NOTIFICATION_PREVIEW', {
            to: emailTo,
            subject,
            text,
            html,
        });

        return {
            success: true,
            provider,
            previewOnly: true,
        };
    }

    return {
        skipped: true,
        reason: `Unsupported EMAIL_PROVIDER: ${provider}`,
    };
}