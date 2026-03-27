// src/fetchers/policyFetcher.js

import Apify from 'apify';

/**
 * Fetch the text content of a policy page.
 * @param {string} url - The URL of the policy page to fetch.
 * @returns {Promise<string>} - The raw HTML/text content of the page.
 */
export async function fetchPolicyText(url) {
    try {
        const response = await Apify.utils.requestAsBrowser({ url });
        return response.body;
    } catch (err) {
        throw new Error(`Failed to fetch policy text from ${url}: ${err.message}`);
    }
}
