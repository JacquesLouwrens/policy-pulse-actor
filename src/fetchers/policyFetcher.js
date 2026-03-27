// src/fetchers/policyFetcher.js

/**
 * Fetch the text content of a policy page.
 * @param {string} url - The URL of the policy page to fetch.
 * @returns {Promise<string>} - The raw HTML/text content of the page.
 */
export async function fetchPolicyText(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const body = await response.text();
        return body;

    } catch (err) {
        throw new Error(`Failed to fetch policy text from ${url}: ${err.message}`);
    }
}
