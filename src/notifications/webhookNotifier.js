export async function sendWebhookAlert(webhookUrl, payload) {
    if (!webhookUrl) {
        return { skipped: true, reason: 'No webhook URL provided' };
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Webhook failed with status ${response.status}`);
        }

        return { success: true };
    } catch (error) {
        console.error('Webhook error:', error.message);
        return { success: false, error: error.message };
    }
}