import { gotScraping } from 'apify';

export async function fetchPolicyText(url) {
    const response = await gotScraping({ url });
    return response.body;
}
