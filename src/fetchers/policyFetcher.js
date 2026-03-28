// src/fetchers/policyFetcher.js

import http from 'node:http';
import https from 'node:https';

/**
 * Fetch the text content of a policy page.
 * Tries strict TLS first, then retries with relaxed TLS if the environment
 * cannot validate the remote certificate chain.
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

    try {
        return await requestWithRedirects(parsedUrl, 5, true);
    } catch (err) {
        const msg = err?.message || '';

        const isTlsIssuerError =
            msg.includes('unable to get local issuer certificate') ||
            msg.includes('UNABLE_TO_GET_ISSUER_CERT_LOCALLY') ||
            msg.includes('SELF_SIGNED_CERT_IN_CHAIN') ||
            msg.includes('unable to verify the first certificate');

        if (isTlsIssuerError && parsedUrl.protocol === 'https:') {
            console.warn(`TLS verification failed for ${parsedUrl}. Retrying with relaxed TLS.`);
            return requestWithRedirects(parsedUrl, 5, false);
        }

        throw err;
    }
}

function requestWithRedirects(urlObj, redirectsLeft = 5, verifyTls = true) {
    return new Promise((resolve, reject) => {
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
            protocol: urlObj.protocol,
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: `${urlObj.pathname}${urlObj.search}`,
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
        };

        if (isHttps) {
            options.agent = new https.Agent({
                rejectUnauthorized: verifyTls,
            });
        }

        const req = client.request(options, (res) => {
            const statusCode = res.statusCode || 0;
            const location = res.headers.location;

            // Redirect handling
            if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
                if (redirectsLeft <= 0) {
                    res.resume();
                    reject(new Error(`Too many redirects while fetching ${urlObj.toString()}`));
                    return;
                }

                const nextUrl = new URL(location, urlObj);
                res.resume();
                resolve(requestWithRedirects(nextUrl, redirectsLeft - 1, verifyTls));
                return;
            }

            if (statusCode < 200 || statusCode >= 300) {
                let errorBody = '';

                res.setEncoding('utf8');

                res.on('data', (chunk) => {
                    errorBody += chunk;
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
        });

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