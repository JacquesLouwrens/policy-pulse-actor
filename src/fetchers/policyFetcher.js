import Apify from 'apify';

/**
 * Fetch the text content of a policy page.
 * @param {string} url - The URL of the policy page to fetch.
 * @returns {Promise<string>} - The raw HTML/text content of the page.
 */
export async function fetchPolicyText(url) {
    // Use Apify's requestAsBrowser to handle user-agent, retries, and proxy settings
    const response = await Apify.utils.requestAsBrowser({
        url,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        },
    });

    return response.body;
}
