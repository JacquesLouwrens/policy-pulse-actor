import { httpRequest } from 'apify';

/**
 * Fetch the text content of a policy page.
 * @param {string} url - The URL of the policy page to fetch.
 * @returns {Promise<string>} - The raw HTML/text content of the page.
 */
export async function fetchPolicyText(url) {
    // requestAsBrowser handles user-agent, retries, and proxy settings
    const response = await requestAsBrowser({ url });
    return response.body;
}
