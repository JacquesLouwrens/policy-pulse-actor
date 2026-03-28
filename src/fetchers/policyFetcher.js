// src/fetchers/policyFetcher.js

import http from 'node:http';
import https from 'node:https';

/**
 * Fetch the text content of a policy page.
 * Uses low-level HTTP/HTTPS instead of global fetch for better reliability.
 * @param {string} url
 * @returns {Promise<string>}
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

    return requestWithRedirects(parsedUrl, 5);
}

function requestWithRedirects(urlObj, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        const client = urlObj.protocol === 'https:' ? https : http;

        const req = client.request(
            urlObj,
            {
                method: 'GET',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept':
                        'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Connection': 'close',
                },
                timeout: 30000,
            },
            (res) => {
                const statusCode = res.statusCode || 0;
                const location = res.headers.location;

                // Handle redirects
                if (
                    [301, 302, 303, 307, 308].includes(statusCode) &&
                    location
                ) {
                    if (redirectsLeft <= 0) {
                        reject(new Error(`Too many redirects while fetching ${urlObj.toString()}`));
                        res.resume();
                        return;
                    }

                    const nextUrl = new URL(location, urlObj);
                    res.resume();
                    resolve(requestWithRedirects(nextUrl, redirectsLeft - 1));
                    return;
                }

                if (statusCode < 200 || statusCode >= 300) {
                    let errorBody = '';

                    res.on('data', (chunk) => {
                        errorBody += chunk.toString();
                    });

                    res.on('end', () => {
                        reject(
                            new Error(
                                `HTTP ${statusCode} ${res.statusMessage || ''}`.trim()
                            )
                        );
                    });

                    return;
                }

                let body = '';

                res.setEncoding('utf8');

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    if (!body || !body.trim()) {
                        reject(new Error('Received empty response body'));
                        return;
                    }

                    resolve(body);
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error(`Request timed out while fetching ${urlObj.toString()}`));
        });

        req.on('error', (err) => {
            reject(
                new Error(
                    `Failed to fetch policy text from ${urlObj.toString()}: ${err.message}`
                )
            );
        });

        req.end();
    });
}