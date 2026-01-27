// GuardNet V.01 - Scan Page Logic
// This script runs on scan.html and communicates with the sandbox iframe

const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('url');

// UI Elements
const targetUrlDisplay = document.getElementById('target-url');
const scanningState = document.getElementById('scanning-state');
const resultSafe = document.getElementById('result-safe');
const resultWarning = document.getElementById('result-warning');
const resultPhishing = document.getElementById('result-phishing');
const errorState = document.getElementById('error-state');
const sandboxFrame = document.getElementById('sandbox-frame');

// Initialize
targetUrlDisplay.textContent = targetUrl || 'URL tidak ditemukan';

if (!targetUrl) {
    showError('URL target tidak ditemukan.');
} else {
    // Start scanning after sandbox is ready
    sandboxFrame.onload = () => {
        startScan();
    };
}

// Pending callback for sandbox response
let pendingCallback = null;

// Listen for messages from sandbox
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PREDICT_RESULT') {
        if (pendingCallback) {
            pendingCallback(event.data);
            pendingCallback = null;
        }
    }
});

async function startScan() {
    try {
        // For URL-only analysis - we cannot fetch cross-origin content due to CORS
        // The model will analyze URL features with neutral content defaults
        let pageContent = '';
        console.log('[Scan] Using URL-only analysis (CORS prevents content fetching)');

        // Set up callback for result
        pendingCallback = (response) => {
            if (response.success) {
                const score = response.score;
                console.log(`[Scan] Raw Prediction Score: ${score}`);

                // Convert score to percentage (0-100)
                const percentage = Math.round(score * 100);

                // 3-Tier Classification:
                // 0-25%: Safe (Green)
                // 26-50%: Warning (Yellow)
                // 51-100%: Phishing (Red)

                if (percentage <= 25) {
                    showSafeResult(percentage);
                } else if (percentage <= 50) {
                    showWarningResult(percentage);
                } else {
                    showPhishingResult(percentage);
                }
            } else {
                showError(response.error || 'Gagal menganalisis website.');
            }
        };

        // Send message to sandbox iframe
        sandboxFrame.contentWindow.postMessage({
            type: 'PREDICT',
            url: targetUrl,
            content: pageContent
        }, '*');

        // Timeout after 15 seconds
        setTimeout(() => {
            if (pendingCallback) {
                pendingCallback = null;
                showError('Timeout: Analisis memakan waktu terlalu lama.');
            }
        }, 15000);

    } catch (error) {
        console.error('[Scan] Error:', error);
        showError(error.message || 'Terjadi kesalahan.');
    }
}

function showSafeResult(percentage) {
    scanningState.classList.add('hidden');
    resultSafe.classList.add('active');

    document.getElementById('safe-score').textContent = percentage + '%';
    document.getElementById('safe-confidence-bar').style.width = percentage + '%';
}

function showWarningResult(percentage) {
    scanningState.classList.add('hidden');
    resultWarning.classList.add('active');

    document.getElementById('warning-score').textContent = percentage + '%';
    document.getElementById('warning-confidence-bar').style.width = percentage + '%';
}

function showPhishingResult(percentage) {
    scanningState.classList.add('hidden');
    resultPhishing.classList.add('active');

    document.getElementById('phishing-score').textContent = percentage + '%';
    document.getElementById('phishing-confidence-bar').style.width = percentage + '%';
}

function showError(message) {
    scanningState.classList.add('hidden');
    errorState.classList.add('active');
    document.getElementById('error-message').textContent = message;
}

// Helper to proceed to URL
function proceedToUrl() {
    // Trust the domain temporarily for this navigation
    // This prevents re-scanning when redirecting
    const baseDomain = getBaseDomain(targetUrl);

    if (baseDomain) {
        chrome.runtime.sendMessage({
            type: 'TRUST_DOMAIN',
            domain: baseDomain
        }, (response) => {
            // Navigate regardless of response
            window.location.href = targetUrl;
        });
    } else {
        // Fallback - just navigate
        window.location.href = targetUrl;
    }
}

// Button handlers - Safe
document.getElementById('proceed-safe').addEventListener('click', proceedToUrl);
document.getElementById('back-safe').addEventListener('click', () => window.history.back());

// Button handlers - Warning
document.getElementById('proceed-warning').addEventListener('click', () => {
    if (confirm('⚠️ Website ini memiliki risiko menengah.\n\nApakah Anda yakin ingin melanjutkan?')) {
        proceedToUrl();
    }
});
document.getElementById('back-warning').addEventListener('click', () => window.history.back());

// Button handlers - Phishing
document.getElementById('proceed-phishing').addEventListener('click', () => {
    if (confirm('🚫 PERINGATAN KERAS!\n\nWebsite ini kemungkinan besar adalah situs PHISHING berbahaya!\n\nMelanjutkan dapat menyebabkan:\n• Pencurian data pribadi\n• Pencurian password\n• Kerugian finansial\n\nApakah Anda BENAR-BENAR yakin ingin melanjutkan?')) {
        proceedToUrl();
    }
});
document.getElementById('back-phishing').addEventListener('click', () => window.history.back());

// Button handlers - Error
document.getElementById('proceed-error').addEventListener('click', proceedToUrl);
document.getElementById('back-error').addEventListener('click', () => window.history.back());

// =====================================================
// TRUST DOMAIN HANDLERS
// When user clicks "Percayai Domain Ini", the domain is
// added to session trusted list and all future requests
// to that domain are automatically allowed
// =====================================================

function getBaseDomain(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        // For Indonesian domains like "kaskus.co.id", we want "kaskus.co.id"
        // For regular domains like "www.example.com", we want "example.com"
        const parts = hostname.split('.');

        // Check for compound TLDs (co.id, com.au, etc.)
        const compoundTLDs = ['co.id', 'or.id', 'ac.id', 'go.id', 'web.id', 'my.id',
            'co.uk', 'com.au', 'co.jp', 'com.sg'];

        for (const ctld of compoundTLDs) {
            if (hostname.endsWith('.' + ctld)) {
                // Get one level up from compound TLD
                const ctldParts = ctld.split('.').length;
                return parts.slice(-(ctldParts + 1)).join('.');
            }
        }

        // Regular domain - take last 2 parts (e.g., example.com)
        if (parts.length >= 2) {
            // If first part is www, skip it
            if (parts[0] === 'www' && parts.length > 2) {
                return parts.slice(1).join('.');
            }
            return parts.slice(-2).join('.');
        }

        return hostname;
    } catch (e) {
        return null;
    }
}
