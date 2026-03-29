// src/fetchers/policyFetcher.js

import { chromium } from 'playwright';

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

    let browser;

    try {
        browser = await chromium.launch({
            channel: 'chrome',
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const context = await browser.newContext({
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            locale: 'en-US',
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Upgrade-Insecure-Requests': '1',
            },
        });

        const page = await context.newPage();

        const response = await page.goto(parsedUrl.toString(), {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });

        const status = response?.status() ?? 0;

        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

        const text = await page.evaluate(() => {
            const bodyText = document.body?.innerText?.trim() || '';
            if (bodyText) return bodyText;
            return document.documentElement?.outerHTML || '';
        });

        await context.close();
        await browser.close();

        if (status >= 400) {
            throw new Error(`HTTP ${status}`);
        }

        if (!text || !text.trim()) {
            throw new Error('Received empty page content');
        }

        return text;
    } catch (err) {
        if (browser) {
            try {
                await browser.close();
            } catch {}
        }

        throw new Error(`Failed to fetch policy text from ${parsedUrl.toString()}: ${err.message}`);
    }
}
