// GuardNet - Offscreen Document for TensorFlow.js
// This script runs in a separate context with relaxed CSP

let model = null;
const MODEL_PATH = chrome.runtime.getURL('models/model.json');

// Load the model
async function loadModel() {
    if (!model) {
        console.log('[Offscreen] Loading model from:', MODEL_PATH);
        try {
            model = await tf.loadLayersModel(MODEL_PATH);
            console.log('[Offscreen] Model loaded successfully');
        } catch (e) {
            console.error('[Offscreen] Failed to load model:', e);
            throw e;
        }
    }
    return model;
}

// Helper functions for features
function countChar(str, char) {
    return (str.split(char).length - 1);
}

function calculateEntropy(str) {
    if (!str) return 0;
    const len = str.length;
    const frequencies = {};
    for (let i = 0; i < len; i++) {
        const char = str[i];
        frequencies[char] = (frequencies[char] || 0) + 1;
    }
    let entropy = 0;
    for (const char in frequencies) {
        const p = frequencies[char] / len;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

/**
 * Extracts 50 numerical features from the URL and Page Content.
 * @param {string} urlStr - The URL to analyze.
 * @param {string} content - The HTML content of the page.
 * @returns {number[]} - Array of 50 numerical features.
 */
function extractFeatures(urlStr, content) {
    if (!content) {
        console.warn('[Offscreen] No content provided, features may be inaccurate.');
        content = '<html></html>';
    }

    let urlObj;
    try {
        urlObj = new URL(urlStr);
    } catch (e) {
        console.error('Invalid URL:', urlStr);
        return new Array(50).fill(0);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(content || '', 'text/html');

    // --- Feature Extraction Logic (50 Features) ---
    const features = [];

    // 1. URLLength
    features.push(urlStr.length);
    // 2. DomainLength
    features.push(urlObj.hostname.length);
    // 3. IsDomainIP
    const isIP = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(urlObj.hostname) ? 1 : 0;
    features.push(isIP);
    // 4. URLSimilarityIndex (Approximation: 100 for now)
    features.push(100.0);
    // 5. CharContinuationRate
    let maxSeq = 0, currSeq = 1;
    for (let i = 1; i < urlStr.length; i++) {
        if (urlStr[i] === urlStr[i - 1]) currSeq++;
        else { maxSeq = Math.max(maxSeq, currSeq); currSeq = 1; }
    }
    features.push(maxSeq / urlStr.length);
    // 6. TLDLegitimateProb
    const tld = urlObj.hostname.split('.').pop();
    const commonTLDs = ['com', 'org', 'net', 'edu', 'gov'];
    features.push(commonTLDs.includes(tld) ? 0.9 : 0.1);
    // 7. URLCharProb
    features.push(1.0 / (calculateEntropy(urlStr) + 1));
    // 8. TLDLength
    features.push(tld.length);
    // 9. NoOfSubDomain
    const parts = urlObj.hostname.split('.');
    features.push(parts.length - 2 > 0 ? parts.length - 2 : 0);
    // 10. HasObfuscation
    features.push(/%[0-9A-Fa-f]{2}/.test(urlStr) ? 1 : 0);
    // 11. NoOfObfuscatedChar
    features.push((urlStr.match(/%[0-9A-Fa-f]{2}/g) || []).length);
    // 12. ObfuscationRatio
    features.push(features[10] / urlStr.length);
    // 13. NoOfLettersInURL
    features.push((urlStr.match(/[a-zA-Z]/g) || []).length);
    // 14. LetterRatioInURL
    features.push(features[12] / urlStr.length);
    // 15. NoOfDegitsInURL
    features.push((urlStr.match(/\d/g) || []).length);
    // 16. DegitRatioInURL
    features.push(features[14] / urlStr.length);
    // 17. NoOfEqualsInURL
    features.push(countChar(urlStr, '='));
    // 18. NoOfQMarkInURL
    features.push(countChar(urlStr, '?'));
    // 19. NoOfAmpersandInURL
    features.push(countChar(urlStr, '&'));
    // 20. NoOfOtherSpecialCharsInURL
    features.push((urlStr.match(/[^a-zA-Z0-9\s]/g) || []).length);
    // 21. SpacialCharRatioInURL
    features.push(features[19] / urlStr.length);
    // 22. IsHTTPS
    features.push(urlObj.protocol === 'https:' ? 1 : 0);

    // -- Content Based Features --

    // 23. LineOfCode
    features.push(content.split('\n').length);
    // 24. LargestLineLength
    features.push(Math.max(...content.split('\n').map(l => l.length), 0));
    // 25. HasTitle
    features.push(doc.title ? 1 : 0);
    // 26. DomainTitleMatchScore
    const title = doc.title.toLowerCase();
    const domain = urlObj.hostname.toLowerCase();
    features.push(title.includes(domain) || domain.includes(title) ? 100 : 0);
    // 27. URLTitleMatchScore
    features.push(title.includes(urlStr) ? 100 : 0);
    // 28. HasFavicon
    features.push(doc.querySelector('link[rel*="icon"]') ? 1 : 0);
    // 29. Robots
    features.push(content.toLowerCase().includes('robots.txt') ? 1 : 0);
    // 30. IsResponsive
    features.push(doc.querySelector('meta[name="viewport"]') || content.includes('@media') ? 1 : 0);
    // 31. NoOfURLRedirect
    features.push(0);
    // 32. NoOfSelfRedirect
    features.push(0);
    // 33. HasDescription
    features.push(doc.querySelector('meta[name="description"]') ? 1 : 0);
    // 34. NoOfPopup
    features.push(countChar(content.toLowerCase(), 'window.open'));
    // 35. NoOfiFrame
    features.push(doc.querySelectorAll('iframe').length);
    // 36. HasExternalFormSubmit
    {
        const forms = Array.from(doc.querySelectorAll('form'));
        let external = 0;
        forms.forEach(f => {
            if (f.action && f.action.startsWith('http') && !f.action.includes(urlObj.hostname)) external = 1;
        });
        features.push(external);
    }
    // 37. HasSocialNet
    features.push(/facebook|twitter|instagram|linkedin/.test(content.toLowerCase()) ? 1 : 0);
    // 38. HasSubmitButton
    features.push(doc.querySelector('input[type="submit"], button[type="submit"]') ? 1 : 0);
    // 39. HasHiddenFields
    features.push(doc.querySelectorAll('input[type="hidden"]').length > 0 ? 1 : 0);
    // 40. HasPasswordField
    features.push(doc.querySelectorAll('input[type="password"]').length > 0 ? 1 : 0);
    // 41. Bank
    features.push(/bank|banking/.test(content.toLowerCase()) ? 1 : 0);
    // 42. Pay
    features.push(/pay|payment/.test(content.toLowerCase()) ? 1 : 0);
    // 43. Crypto
    features.push(/crypto|bitcoin/.test(content.toLowerCase()) ? 1 : 0);
    // 44. HasCopyrightInfo
    features.push(/copyright|©/.test(content.toLowerCase()) ? 1 : 0);
    // 45. NoOfImage
    features.push(doc.querySelectorAll('img').length);
    // 46. NoOfCSS
    features.push(doc.querySelectorAll('link[rel="stylesheet"], style').length);
    // 47. NoOfJS
    features.push(doc.querySelectorAll('script').length);
    // 48. NoOfSelfRef
    {
        const links = Array.from(doc.querySelectorAll('a'));
        const selfRef = links.filter(a => a.href.includes(urlObj.hostname) || a.href.startsWith('/') || a.href.startsWith('#')).length;
        features.push(selfRef);
    }
    // 49. NoOfEmptyRef
    {
        const links = Array.from(doc.querySelectorAll('a'));
        const emptyRef = links.filter(a => a.href === '' || a.href === '#').length;
        features.push(emptyRef);
    }
    // 50. NoOfExternalRef
    {
        const links = Array.from(doc.querySelectorAll('a'));
        const extRef = links.filter(a => a.href.startsWith('http') && !a.href.includes(urlObj.hostname)).length;
        features.push(extRef);
    }

    // Ensure 50 features exactly
    return features.slice(0, 50);
}

// Predict function
async function predict(url, content) {
    await loadModel();

    console.log('[Offscreen] Extracting features for:', url);
    const features = extractFeatures(url, content);
    console.log('[Offscreen] Features:', features);

    const inputTensor = tf.tensor2d([features], [1, 50]);

    const prediction = model.predict(inputTensor);
    const score = prediction.dataSync()[0];

    // Cleanup tensors
    inputTensor.dispose();
    prediction.dispose();

    console.log('[Offscreen] Prediction score:', score);
    return score;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PREDICT') {
        predict(message.url, message.content)
            .then(score => {
                sendResponse({ success: true, score: score });
            })
            .catch(error => {
                console.error('[Offscreen] Prediction error:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep the message channel open for async response
    }
});

// Pre-load model on start
loadModel().catch(err => console.error('[Offscreen] Pre-load error:', err));
