// src/fetchers/policyFetcher.js

/**
 * Fetch the text content of a policy page.
 * @param {string} url - The URL of the policy page to fetch.
 * @returns {Promise<string>} - The raw HTML/text content of the page.
 */
export async function fetchPolicyText(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('fetchPolicyText requires a valid URL string.');
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error(`Invalid URL provided: ${url}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(parsedUrl.toString(), {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const body = await response.text();

        if (!body || !body.trim()) {
            throw new Error('Received empty response body');
        }

        return body;
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`Request timed out while fetching ${url}`);
        }

        throw new Error(`Failed to fetch policy text from ${url}: ${err.message}`);
    } finally {
        clearTimeout(timeout);
    }
}