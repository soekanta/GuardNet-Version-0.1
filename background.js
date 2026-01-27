// GuardNet - Background Service Worker
// Intercepts navigation and redirects to scan page

const SCAN_PAGE_PATH = 'scan.html';

// =====================================================
// SESSION TRUSTED DOMAINS
// Domains that user has verified as safe during this session
// =====================================================
let sessionTrustedDomains = new Set();

// Listen for messages from scan page to trust a domain
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRUST_DOMAIN') {
        const domain = message.domain;
        sessionTrustedDomains.add(domain);
        console.log('[Background] Domain trusted for session:', domain);
        console.log('[Background] Session trusted domains:', Array.from(sessionTrustedDomains));
        sendResponse({ success: true });
    } else if (message.type === 'GET_TRUSTED_DOMAINS') {
        sendResponse({ domains: Array.from(sessionTrustedDomains) });
    } else if (message.type === 'CLEAR_TRUSTED_DOMAINS') {
        sessionTrustedDomains.clear();
        console.log('[Background] Session trusted domains cleared');
        sendResponse({ success: true });
    }
    return true; // Keep channel open for async response
});

// Check if domain is in session trusted list
function isSessionTrusted(hostname) {
    console.log('[Background] Checking session trust for:', hostname);
    console.log('[Background] Session trusted domains:', Array.from(sessionTrustedDomains));

    // Normalize hostname (remove www if present)
    const normalizedHostname = hostname.replace(/^www\./, '');

    // Check exact match
    if (sessionTrustedDomains.has(hostname) || sessionTrustedDomains.has(normalizedHostname)) {
        console.log('[Background] Exact match found for:', hostname);
        return true;
    }

    // Check if base domain is trusted (e.g., kaskus.co.id trusts *.kaskus.co.id)
    for (const trustedDomain of sessionTrustedDomains) {
        // Check if hostname ends with trusted domain
        if (hostname.endsWith('.' + trustedDomain) ||
            normalizedHostname.endsWith('.' + trustedDomain) ||
            hostname === trustedDomain ||
            normalizedHostname === trustedDomain) {
            console.log('[Background] Domain match found:', hostname, '→', trustedDomain);
            return true;
        }

        // Also check if trusted domain ends with our hostname (reverse check)
        // e.g., if "www.kaskus.co.id" is in list, "kaskus.co.id" should also be trusted
        const normalizedTrusted = trustedDomain.replace(/^www\./, '');
        if (normalizedHostname === normalizedTrusted ||
            normalizedHostname.endsWith('.' + normalizedTrusted)) {
            console.log('[Background] Reverse domain match:', hostname, '→', trustedDomain);
            return true;
        }
    }

    console.log('[Background] No session trust match for:', hostname);
    return false;
}

// =====================================================
// WHITELIST: Trusted domains that should NEVER be scanned
// =====================================================
const TRUSTED_DOMAINS = [
    // Search Engines
    'google.com', 'www.google.com', 'google.co.id',
    'bing.com', 'www.bing.com',
    'duckduckgo.com', 'www.duckduckgo.com',
    'yahoo.com', 'www.yahoo.com', 'search.yahoo.com',
    'yandex.com', 'www.yandex.com',
    'baidu.com', 'www.baidu.com',

    // Q&A and Forums
    'quora.com', 'www.quora.com', 'id.quora.com',
    'stackoverflow.com', 'www.stackoverflow.com',
    'stackexchange.com', 'www.stackexchange.com',
    'medium.com', 'www.medium.com',

    // Major Social Media
    'facebook.com', 'www.facebook.com', 'm.facebook.com',
    'instagram.com', 'www.instagram.com',
    'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
    'linkedin.com', 'www.linkedin.com',
    'tiktok.com', 'www.tiktok.com',
    'reddit.com', 'www.reddit.com',
    'pinterest.com', 'www.pinterest.com',

    // Major Tech Companies
    'microsoft.com', 'www.microsoft.com', 'login.microsoftonline.com',
    'apple.com', 'www.apple.com',
    'amazon.com', 'www.amazon.com',
    'github.com', 'www.github.com',
    'gitlab.com', 'www.gitlab.com',

    // Video/Media
    'youtube.com', 'www.youtube.com', 'm.youtube.com',
    'netflix.com', 'www.netflix.com',
    'spotify.com', 'www.spotify.com',
    'twitch.tv', 'www.twitch.tv',

    // Productivity
    'gmail.com', 'mail.google.com',
    'outlook.com', 'outlook.live.com',
    'drive.google.com', 'docs.google.com',
    'dropbox.com', 'www.dropbox.com',
    'notion.so', 'www.notion.so',
    'slack.com', 'www.slack.com',
    'discord.com', 'www.discord.com', 'discord.gg',
    'zoom.us', 'www.zoom.us',

    // Shopping
    'shopee.co.id', 'shopee.com',
    'tokopedia.com', 'www.tokopedia.com',
    'bukalapak.com', 'www.bukalapak.com',
    'lazada.co.id', 'lazada.com',
    'ebay.com', 'www.ebay.com',
    'aliexpress.com', 'www.aliexpress.com',

    // Banking (Indonesia)
    'bca.co.id', 'klikbca.com', 'ibank.bca.co.id',
    'bni.co.id', 'ibank.bni.co.id',
    'bri.co.id', 'ib.bri.co.id',
    'mandirionline.co.id', 'bankmandiri.co.id',

    // News
    'detik.com', 'www.detik.com',
    'kompas.com', 'www.kompas.com',
    'tribunnews.com', 'www.tribunnews.com',
    'cnn.com', 'www.cnn.com',
    'bbc.com', 'www.bbc.com',

    // Others
    'wikipedia.org', 'en.wikipedia.org', 'id.wikipedia.org',
    'whatsapp.com', 'web.whatsapp.com',
    'telegram.org', 'web.telegram.org'
];

// Trusted TLDs (education, government, etc.)
const TRUSTED_TLDS = [
    '.edu',      // US Education
    '.ac.id',    // Indonesia Education
    '.ac.uk',    // UK Education
    '.edu.au',   // Australia Education
    '.gov',      // US Government
    '.gov.id',   // Indonesia Government
    '.go.id',    // Indonesia Government
    '.mil',      // US Military
];

// Check if URL is from a trusted domain or TLD
function isTrustedDomain(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        // Check exact match or subdomain match for trusted domains
        for (const trusted of TRUSTED_DOMAINS) {
            if (hostname === trusted || hostname.endsWith('.' + trusted)) {
                return true;
            }
        }

        // Check trusted TLDs (education, government, etc.)
        for (const tld of TRUSTED_TLDS) {
            if (hostname.endsWith(tld)) {
                console.log('[Background] Trusted TLD detected:', tld);
                return true;
            }
        }

        return false;
    } catch (e) {
        return false;
    }
}

// Whitelist of URLs to skip (internal pages, already verified, etc.)
function shouldSkipUrl(url) {
    if (!url) return true;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return true;
    if (url.includes('guardnet-verified')) return true;

    // Skip trusted domains
    if (isTrustedDomain(url)) {
        console.log('[Background] Trusted domain, skipping:', url);
        return true;
    }

    // Skip session trusted domains (user verified safe)
    try {
        const urlObj = new URL(url);
        if (isSessionTrusted(urlObj.hostname)) {
            console.log('[Background] Session trusted domain, skipping:', url);
            return true;
        }
    } catch (e) { }

    // Skip Chrome/Edge internal pages
    if (url.includes('chrome.google.com')) return true;
    if (url.includes('chrome://')) return true;
    if (url.includes('edge://')) return true;
    if (url.includes('about:')) return true;
    if (url.includes('chrome-extension://')) return true;

    // Skip our own extension pages
    try {
        const extensionOrigin = chrome.runtime.getURL('');
        if (url.startsWith(extensionOrigin)) return true;
    } catch (e) { }

    return false;
}

// Intercept navigation BEFORE the page loads
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    // Only intercept main frame navigation
    if (details.frameId !== 0) return;

    const url = details.url;

    // Check if we should skip this URL
    if (shouldSkipUrl(url)) {
        return;
    }

    console.log('[Background] Intercepting navigation to:', url);

    // Redirect to our scan page
    const scanPageUrl = chrome.runtime.getURL(SCAN_PAGE_PATH) + '?url=' + encodeURIComponent(url);

    chrome.tabs.update(details.tabId, { url: scanPageUrl });
});

console.log('[Background] GuardNet Real-time Protection Active');
console.log('[Background] Trusted domains whitelisted:', TRUSTED_DOMAINS.length);
