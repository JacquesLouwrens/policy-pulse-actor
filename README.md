# 🤖 Semantic Policy Change Detection Actor

[![Built with Apify](https://img.shields.io/badge/Built%20with-Apify-orange)](https://apify.com)
[![Apify SDK](https://img.shields.io/badge/Apify_SDK-3.5.2-blue)](https://sdk.apify.com)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

## 🎯 **Overview**
A sophisticated AI-powered actor that monitors and detects semantic changes in policies, regulations, and legal documents. Using advanced NLP techniques, it identifies meaningful content changes beyond simple text differences.

## ✨ **Features**
- 🔍 **Semantic Analysis** - Understands meaning, not just text changes
- 🚨 **Intelligent Alerts** - Generates actionable signals based on change severity
- 📊 **Confidence Scoring** - Quantifies detection certainty
- 🔄 **Version Tracking** - Maintains historical context for accurate diff detection
- ⚡ **Real-time Monitoring** - Detects changes as they happen

## 🚀 **Quick Start**

### **Method 1: Apify Console (Easiest)**
1. Visit your actor: [https://console.apify.com/actors/ScXMKVtO10tXHiBJN](https://console.apify.com/actors/ScXMKVtO10tXHiBJN)
2. Switch from "Source" to "Run" tab
3. Enter: `{"url": "https://example.com/privacy-policy"}`
4. Click **"Run"**

### **Method 2: API Call (Programmatic)**
```bash
curl -X POST "https://api.apify.com/v2/acts/ScXMKVtO10tXHiBJN/runs" \
  -H "Authorization: Bearer $APIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/privacy-policy"}'

### **Method 3: javaScript SDK**
import { ApifyClient } from 'apify-client';

// Initialize with your API token
const client = new ApifyClient({
    token: 'YOUR_APIFY_API_TOKEN', // Get from https://console.apify.com/account#/integrations
});

// Run the actor
const run = await client.actor('ScXMKVtO10tXHiBJN').call({
    url: 'https://example.com/privacy-policy'
});

// Get results (output matching your schema)
const dataset = await client.dataset(run.defaultDatasetId).listItems();
console.log(dataset.items[0]); // Contains: hasSemanticChange, confidence, summary, timestamp

### **Method 4: Apify CLI **
# Install CLI first
npm install -g apify-cli

# Run actor from command line
apify call ScXMKVtO10tXHiBJN \
  --token $APIFY_API_TOKEN \
  --input '{"url": "https://example.com/privacy-policy"}'

### **Method 5: Webhook (Real-time alerts) **
Configure in Apify Console → your actor → Settings → Webhooks
{
  "webhookUrl": "https://your-server.com/webhook",
  "eventTypes": ["ACTOR.RUN.SUCCEEDED"]
}

📥 Input Schema

{
  "url": {
    "type": "string",
    "description": "URL of the policy/document to monitor",
    "example": "https://apple.com/legal/privacy",
    "required": true
  }
}

📤 Output Schema

{
  "hasSemanticChange": {
    "type": "boolean",
    "description": "Whether meaningful semantic changes were detected"
  },
  "confidence": {
    "type": "number",
    "description": "Detection confidence score (0-1)",
    "minimum": 0,
    "maximum": 1
  },
  "summary": {
    "type": "string",
    "description": "Human-readable explanation of detected changes"
  },
  "timestamp": {
    "type": "string",
    "format": "date-time",
    "description": "ISO 8601 timestamp of detection"
  }
}

🔧 How It Works

Processing Pipeline
URL Fetching → Downloads the policy document

Text Extraction → Extracts clean text from HTML/PDF

Semantic Analysis → Identifies topics, obligations, permissions, restrictions

Change Detection → Compares with previous version

Signal Generation → Creates alerts based on severity

Results Storage → Saves to Dataset and Key-Value Store

🏢 Use Cases
Compliance Monitoring
Ideal for: Legal teams tracking GDPR, CCPA, HIPAA compliance

Example: {"url": "https://business.twitter.com/en/help/agreements/privacy-policy.html"}

Competitive Intelligence
Ideal for: Product managers monitoring competitor TOS changes

Example: {"url": "https://www.microsoft.com/en-us/servicesagreement/"}

Vendor Risk Management
Ideal for: Procurement teams monitoring vendor agreement changes

Example: {"url": "https://aws.amazon.com/service-terms/"}

AI Governance
Ideal for: AI ethics boards monitoring AI policy changes

Example: {"url": "https://openai.com/policies/usage-policies"}

📈 Getting Your API Token
Go to Apify Account Settings

Under "API token", click "Show"

Copy token starting with apify_api_

Use as: --token YOUR_TOKEN or set APIFY_API_TOKEN environment variable

🔗 Quick Links
🔄 Run Actor: https://console.apify.com/actors/ScXMKVtO10tXHiBJN/runs

📊 View Results: Dataset tab after running

🔧 API Docs: https://docs.apify.com/api/v2

📞 Need Help?
Apify Documentation: https://docs.apify.com

Community Support: https://forum.apify.com

Contact: Use Apify Console messaging

Ready to start monitoring? Run your first analysis now

Actor ID: ScXMKVtO10tXHiBJN • Last updated: January 2026















