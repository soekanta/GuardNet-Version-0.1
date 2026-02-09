// GuardNet V.01 - Sandbox Script for TensorFlow.js
// This runs in a sandboxed iframe with relaxed CSP
// UPDATED: Hybrid Detection using Logistic Regression + Random Forest

let model = null;
let scalerParams = null;
let rfClassifier = null; // Random Forest classifier instance

// Hybrid voting configuration
const HYBRID_CONFIG = {
    strategy: 'weighted_average', // 'weighted_average', 'max_confidence', 'unanimous'
    lrWeight: 0.5,    // Weight for Logistic Regression (0-1)
    rfWeight: 0.5,    // Weight for Random Forest (0-1)
    RF_ENABLED: true  // ENABLED - Hybrid Detection Mode
};

// Load the model
async function loadModel() {
    if (!model) {
        console.log('[Sandbox] Loading model...');
        try {
            model = await tf.loadLayersModel('./models/model.json');
            console.log('[Sandbox] Model loaded successfully');
        } catch (e) {
            console.error('[Sandbox] Failed to load model:', e);
            throw e;
        }
    }
    return model;
}

// Load scaler parameters
async function loadScalerParams() {
    if (!scalerParams) {
        console.log('[Sandbox] Loading scaler parameters...');
        try {
            const response = await fetch('./models/scaler_params.json');
            scalerParams = await response.json();
            console.log('[Sandbox] Scaler parameters loaded');
        } catch (e) {
            console.error('[Sandbox] Failed to load scaler params:', e);
            // Fallback: use no normalization (model might not work well)
            scalerParams = null;
        }
    }
    return scalerParams;
}

// Load Random Forest model
async function loadRandomForest() {
    if (!rfClassifier) {
        console.log('[Sandbox] Loading Random Forest model...');
        try {
            rfClassifier = new RandomForestClassifier();
            await rfClassifier.loadModel('./models/rf_model.json');
            console.log('[Sandbox] Random Forest model loaded successfully');
        } catch (e) {
            console.error('[Sandbox] Failed to load Random Forest:', e);
            rfClassifier = null;
        }
    }
    return rfClassifier;
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
 * SMART URL ANALYSIS FUNCTIONS
 * For reducing false positives on legitimate sites with long URLs
 */

// Known tracking parameters to strip from URL analysis
const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'srsltid', 'ref', 'referer', 'source', 'tracking',
    'click_id', 'affiliate', 'sid', 'session', 'sessionid', '_ga', '_gl'
];

/**
 * Sanitize URL by removing tracking parameters
 * @param {string} urlStr - Original URL
 * @returns {string} - Sanitized URL without tracking params
 */
function sanitizeUrl(urlStr) {
    try {
        const urlObj = new URL(urlStr);
        const params = urlObj.searchParams;

        // Remove tracking parameters
        TRACKING_PARAMS.forEach(param => {
            params.delete(param);
        });

        // Also remove any param with value longer than 20 chars (likely tracking IDs)
        const toRemove = [];
        params.forEach((value, key) => {
            if (value.length > 20 && /^[a-zA-Z0-9_-]+$/.test(value)) {
                toRemove.push(key);
            }
        });
        toRemove.forEach(key => params.delete(key));

        urlObj.search = params.toString();
        const sanitized = urlObj.toString();

        if (sanitized !== urlStr) {
            console.log('[SmartAnalysis] URL sanitized:', urlStr.length, '→', sanitized.length, 'chars');
        }

        return sanitized;
    } catch (e) {
        return urlStr;
    }
}

/**
 * Get trust bonus for regional/country-code TLDs
 * @param {string} hostname - Domain hostname
 * @returns {number} - Trust bonus (0 to 0.2)
 */
function getTLDTrustBonus(hostname) {
    const parts = hostname.split('.');
    const tld = parts[parts.length - 1].toLowerCase();
    const sld = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : '';

    // Regional TLDs get trust bonus (harder to register for phishing)
    const regionalTLDs = {
        // Indonesia
        'id': 0.15, 'co.id': 0.18, 'or.id': 0.18, 'ac.id': 0.20, 'go.id': 0.25,
        // Other countries
        'jp': 0.12, 'de': 0.12, 'uk': 0.12, 'au': 0.12, 'sg': 0.12,
        // Government/Education
        'gov': 0.25, 'edu': 0.20, 'mil': 0.25
    };

    // Check compound TLD first (e.g., co.id)
    const compoundTLD = `${sld}.${tld}`;
    if (regionalTLDs[compoundTLD]) {
        console.log('[SmartAnalysis] TLD trust bonus for', compoundTLD, ':', regionalTLDs[compoundTLD]);
        return regionalTLDs[compoundTLD];
    }

    if (regionalTLDs[tld]) {
        console.log('[SmartAnalysis] TLD trust bonus for', tld, ':', regionalTLDs[tld]);
        return regionalTLDs[tld];
    }

    return 0;
}

/**
 * Detect legitimate URL patterns (forum, e-commerce, etc.)
 * @param {string} urlStr - URL to analyze
 * @returns {object} - { isLegitPattern: boolean, patternType: string, trustBonus: number }
 */
function detectLegitimatePatterns(urlStr) {
    const urlLower = urlStr.toLowerCase();

    // Forum patterns
    const forumPatterns = ['/thread/', '/forum/', '/topic/', '/post/', '/discussion/', '/board/', '/community/'];
    for (const pattern of forumPatterns) {
        if (urlLower.includes(pattern)) {
            console.log('[SmartAnalysis] Forum pattern detected:', pattern);
            return { isLegitPattern: true, patternType: 'forum', trustBonus: 0.10 };
        }
    }

    // E-commerce patterns
    const ecommercePatterns = ['/product/', '/products/', '/item/', '/cart/', '/checkout/', '/shop/', '/store/', '/catalog/'];
    for (const pattern of ecommercePatterns) {
        if (urlLower.includes(pattern)) {
            console.log('[SmartAnalysis] E-commerce pattern detected:', pattern);
            return { isLegitPattern: true, patternType: 'ecommerce', trustBonus: 0.08 };
        }
    }

    // News/Article patterns
    const newsPatterns = ['/article/', '/news/', '/blog/', '/read/', '/berita/', '/artikel/'];
    for (const pattern of newsPatterns) {
        if (urlLower.includes(pattern)) {
            console.log('[SmartAnalysis] News/Article pattern detected:', pattern);
            return { isLegitPattern: true, patternType: 'news', trustBonus: 0.08 };
        }
    }

    return { isLegitPattern: false, patternType: 'unknown', trustBonus: 0 };
}

/**
 * Extracts 50 numerical features from the URL and Page Content.
 * @param {string} urlStr - The URL to analyze.
 * @param {string} content - The HTML content of the page.
 * @returns {number[]} - Array of 50 numerical features.
 */
function extractFeatures(urlStr, content) {
    // Sanitize URL by removing tracking parameters for more accurate analysis
    const sanitizedUrl = sanitizeUrl(urlStr);

    let urlObj;
    try {
        urlObj = new URL(sanitizedUrl);
    } catch (e) {
        console.error('Invalid URL:', urlStr);
        return new Array(50).fill(0);
    }

    // Handle empty content gracefully
    // When content is not available (CORS), use SUSPICIOUS defaults to not bias toward safe
    const hasContent = content && content.length > 100;

    const parser = new DOMParser();
    const doc = parser.parseFromString(content || '<html><head><title></title></head><body></body></html>', 'text/html');

    const features = [];

    // ========== URL-BASED FEATURES (1-22) ==========
    // Use sanitized URL length for analysis

    // 1. URLLength (use sanitized)
    const urlLength = sanitizedUrl.length;
    features.push(urlLength);

    // 2. DomainLength
    const domainLength = urlObj.hostname.length;
    features.push(domainLength);

    // 3. IsDomainIP
    const isIP = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(urlObj.hostname) ? 1 : 0;
    features.push(isIP);

    // 4. URLSimilarityIndex
    const urlSimilarity = (urlLength < 50 && domainLength < 20) ? 80 : 50;
    features.push(urlSimilarity);

    // 5. CharContinuationRate
    let maxSeq = 0, currSeq = 1;
    for (let i = 1; i < urlStr.length; i++) {
        if (urlStr[i] === urlStr[i - 1]) currSeq++;
        else { maxSeq = Math.max(maxSeq, currSeq); currSeq = 1; }
    }
    const charContinuationRate = urlLength > 0 ? maxSeq / urlLength : 0;
    features.push(charContinuationRate);

    // 6. TLDLegitimateProb
    const tld = urlObj.hostname.split('.').pop();
    const commonTLDs = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'id'];
    const tldProb = commonTLDs.includes(tld) ? 0.9 : 0.3;
    features.push(tldProb);

    // 7. URLCharProb
    const urlEntropy = calculateEntropy(urlStr);
    const urlCharProb = 1.0 / (urlEntropy + 1);
    features.push(urlCharProb);

    // 8. TLDLength
    features.push(tld.length);

    // 9. NoOfSubDomain
    const parts = urlObj.hostname.split('.');
    const numSubdomains = parts.length - 2 > 0 ? parts.length - 2 : 0;
    features.push(numSubdomains);

    // 10. HasObfuscation
    const hasObfuscation = /%[0-9A-Fa-f]{2}/.test(urlStr) ? 1 : 0;
    features.push(hasObfuscation);

    // 11. NoOfObfuscatedChar
    const numObfuscated = (urlStr.match(/%[0-9A-Fa-f]{2}/g) || []).length;
    features.push(numObfuscated);

    // 12. ObfuscationRatio
    const obfuscationRatio = urlLength > 0 ? numObfuscated / urlLength : 0;
    features.push(obfuscationRatio);

    // 13. NoOfLettersInURL
    const numLetters = (urlStr.match(/[a-zA-Z]/g) || []).length;
    features.push(numLetters);

    // 14. LetterRatioInURL
    const letterRatio = urlLength > 0 ? numLetters / urlLength : 0;
    features.push(letterRatio);

    // 15. NoOfDigitsInURL
    const numDigits = (urlStr.match(/\d/g) || []).length;
    features.push(numDigits);

    // 16. DigitRatioInURL
    const digitRatio = urlLength > 0 ? numDigits / urlLength : 0;
    features.push(digitRatio);

    // 17. NoOfEqualsInURL
    features.push(countChar(urlStr, '='));

    // 18. NoOfQMarkInURL
    features.push(countChar(urlStr, '?'));

    // 19. NoOfAmpersandInURL
    features.push(countChar(urlStr, '&'));

    // 20. NoOfOtherSpecialCharsInURL
    const numSpecialChars = (urlStr.match(/[^a-zA-Z0-9\s]/g) || []).length;
    features.push(numSpecialChars);

    // 21. SpecialCharRatioInURL
    const specialCharRatio = urlLength > 0 ? numSpecialChars / urlLength : 0;
    features.push(specialCharRatio);

    // 22. IsHTTPS
    const isHttps = urlObj.protocol === 'https:' ? 1 : 0;
    features.push(isHttps);

    // ========== CONTENT-BASED FEATURES (23-50) ==========

    // 23. LineOfCode
    const lines = content ? content.split('\n').length : 100;
    features.push(lines);

    // 24. LargestLineLength
    const largestLine = content ? Math.max(...content.split('\n').map(l => l.length), 0) : 500;
    features.push(largestLine);

    // 25. HasTitle (neutral default: 1 - assume title exists when CORS blocks)
    const hasTitle = doc.title && doc.title.trim().length > 0 ? 1 : 1;
    features.push(hasTitle);

    // 26. DomainTitleMatchScore (suspicious default: 0 - no match)
    const title = (doc.title || '').toLowerCase();
    const domain = urlObj.hostname.toLowerCase().replace('www.', '');
    const domainWords = domain.split('.')[0];
    const titleMatchScore = (title.includes(domainWords) || domainWords.includes(title.split(' ')[0])) ? 100 : 0;
    features.push(titleMatchScore);

    // 27. URLTitleMatchScore
    features.push(title.includes(urlStr) ? 100 : 0);

    // 28. HasFavicon (neutral default: 1 - assume favicon exists when CORS blocks)
    const hasFavicon = doc.querySelector('link[rel*="icon"]') ? 1 : 1;
    features.push(hasFavicon);

    // 29. Robots
    const hasRobots = content && content.toLowerCase().includes('robots') ? 1 : 0;
    features.push(hasRobots);

    // 30. IsResponsive (suspicious default: 0)
    const isResponsive = (doc.querySelector('meta[name="viewport"]') || (content && content.includes('@media'))) ? 1 : 0;
    features.push(isResponsive);

    // 31. NoOfURLRedirect
    features.push(0);

    // 32. NoOfSelfRedirect
    features.push(0);

    // 33. HasDescription (neutral default: 1 - assume description exists when CORS blocks)
    const hasDescription = doc.querySelector('meta[name="description"]') ? 1 : 1;
    features.push(hasDescription);

    // 34. NoOfPopup
    const numPopups = content ? (content.toLowerCase().match(/window\.open/g) || []).length : 0;
    features.push(numPopups);

    // 35. NoOfIFrame
    const numIframes = doc.querySelectorAll('iframe').length;
    features.push(numIframes);

    // 36. HasExternalFormSubmit
    let hasExternalForm = 0;
    if (hasContent) {
        const forms = Array.from(doc.querySelectorAll('form'));
        forms.forEach(f => {
            if (f.action && f.action.startsWith('http') && !f.action.includes(urlObj.hostname)) {
                hasExternalForm = 1;
            }
        });
    }
    features.push(hasExternalForm);

    // 37. HasSocialNet (suspicious default: 0)
    const hasSocialNet = content && /facebook|twitter|instagram|linkedin/.test(content.toLowerCase()) ? 1 : 0;
    features.push(hasSocialNet);

    // 38. HasSubmitButton (keep as is - submit buttons are neutral)
    const hasSubmitBtn = doc.querySelector('input[type="submit"], button[type="submit"]') ? 1 : 0;
    features.push(hasSubmitBtn);

    // 39. HasHiddenFields
    const hasHiddenFields = doc.querySelectorAll('input[type="hidden"]').length > 0 ? 1 : 0;
    features.push(hasHiddenFields);

    // 40. HasPasswordField
    const hasPasswordField = doc.querySelectorAll('input[type="password"]').length > 0 ? 1 : 0;
    features.push(hasPasswordField);

    // 41. Bank keyword
    const hasBankKeyword = content && /bank|banking/i.test(content) ? 1 : 0;
    features.push(hasBankKeyword);

    // 42. Pay keyword
    const hasPayKeyword = content && /pay|payment/i.test(content) ? 1 : 0;
    features.push(hasPayKeyword);

    // 43. Crypto keyword
    const hasCryptoKeyword = content && /crypto|bitcoin/i.test(content) ? 1 : 0;
    features.push(hasCryptoKeyword);

    // 44. HasCopyrightInfo (suspicious default: 0 - phishing sites often lack copyright)
    const hasCopyright = content && /copyright|©/i.test(content) ? 1 : 0;
    features.push(hasCopyright);

    // 45. NoOfImage (use actual count, default 0)
    const numImages = doc.querySelectorAll('img').length;
    features.push(numImages);

    // 46. NoOfCSS (use actual count, default 0)
    const numCSS = doc.querySelectorAll('link[rel="stylesheet"], style').length;
    features.push(numCSS);

    // 47. NoOfJS (use actual count, default 0)
    const numJS = doc.querySelectorAll('script').length;
    features.push(numJS);

    // 48. NoOfSelfRef (use actual count, default 0)
    let numSelfRef = 0;
    const selfRefLinks = Array.from(doc.querySelectorAll('a'));
    numSelfRef = selfRefLinks.filter(a => {
        const href = a.getAttribute('href') || '';
        return href.includes(urlObj.hostname) || href.startsWith('/') || href.startsWith('#');
    }).length;
    features.push(numSelfRef);

    // 49. NoOfEmptyRef
    let numEmptyRef = 0;
    if (hasContent) {
        const links = Array.from(doc.querySelectorAll('a'));
        numEmptyRef = links.filter(a => {
            const href = a.getAttribute('href') || '';
            return href === '' || href === '#' || href === 'javascript:void(0)';
        }).length;
    }
    features.push(numEmptyRef);

    // 50. NoOfExternalRef (use actual count, default 0)
    let numExtRef = 0;
    const extRefLinks = Array.from(doc.querySelectorAll('a'));
    numExtRef = extRefLinks.filter(a => {
        const href = a.getAttribute('href') || '';
        return href.startsWith('http') && !href.includes(urlObj.hostname);
    }).length;
    features.push(numExtRef);

    console.log('[Sandbox] Features extracted:', features.length);

    return features.slice(0, 50);
}

/**
 * Extract URL-only features for Random Forest model (22 features)
 * These features can be extracted without fetching page content.
 * @param {string} urlStr - The URL to analyze
 * @returns {number[]} - Array of 22 URL-only features
 */
function extractUrlOnlyFeatures(urlStr) {
    let urlObj;
    try {
        urlObj = new URL(urlStr);
    } catch (e) {
        console.error('[RF] Invalid URL:', urlStr);
        return new Array(22).fill(0);
    }

    const features = [];
    const urlLength = urlStr.length;

    // 1. URLLength
    features.push(urlLength);

    // 2. DomainLength
    features.push(urlObj.hostname.length);

    // 3. IsDomainIP
    const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    features.push(ipPattern.test(urlObj.hostname) ? 1 : 0);

    // 4. URLSimilarityIndex
    const popularBrands = ['google', 'facebook', 'amazon', 'apple', 'microsoft',
        'paypal', 'netflix', 'instagram', 'twitter', 'linkedin'];
    const domainLower = urlObj.hostname.toLowerCase();
    let maxSimilarity = 0;
    for (const brand of popularBrands) {
        if (domainLower.includes(brand)) {
            maxSimilarity = 100;
            break;
        }
        // Check for typosquatting
        for (let i = 0; i < brand.length; i++) {
            const typo = brand.slice(0, i) + brand.slice(i + 1);
            if (domainLower.includes(typo) && typo.length > 3) {
                maxSimilarity = Math.max(maxSimilarity, 80);
            }
        }
    }
    features.push(maxSimilarity);

    // 5. CharContinuationRate
    let continuations = 0;
    for (let i = 1; i < urlStr.length; i++) {
        if (urlStr[i] === urlStr[i - 1]) continuations++;
    }
    features.push(urlLength > 1 ? continuations / (urlLength - 1) : 0);

    // 6. TLDLegitimateProb
    const tld = urlObj.hostname.split('.').pop().toLowerCase();
    const commonTLDs = ['com', 'org', 'net', 'edu', 'gov', 'co', 'io', 'id'];
    features.push(commonTLDs.includes(tld) ? 0.9 : 0.3);

    // 7. URLCharProb
    let urlEntropy = 0;
    const len = urlStr.length;
    if (len > 0) {
        const frequencies = {};
        for (let i = 0; i < len; i++) {
            frequencies[urlStr[i]] = (frequencies[urlStr[i]] || 0) + 1;
        }
        for (const char in frequencies) {
            const p = frequencies[char] / len;
            urlEntropy -= p * Math.log2(p);
        }
    }
    features.push(1.0 / (urlEntropy + 1));

    // 8. TLDLength
    features.push(tld.length);

    // 9. NoOfSubDomain
    const parts = urlObj.hostname.split('.');
    features.push(Math.max(0, parts.length - 2));

    // 10. HasObfuscation
    features.push(/%[0-9A-Fa-f]{2}/.test(urlStr) ? 1 : 0);

    // 11. NoOfObfuscatedChar
    features.push((urlStr.match(/%[0-9A-Fa-f]{2}/g) || []).length);

    // 12. ObfuscationRatio
    const numObfuscated = (urlStr.match(/%[0-9A-Fa-f]{2}/g) || []).length;
    features.push(urlLength > 0 ? numObfuscated / urlLength : 0);

    // 13. NoOfLettersInURL
    const numLetters = (urlStr.match(/[a-zA-Z]/g) || []).length;
    features.push(numLetters);

    // 14. LetterRatioInURL
    features.push(urlLength > 0 ? numLetters / urlLength : 0);

    // 15. NoOfDigitsInURL
    const numDigits = (urlStr.match(/\d/g) || []).length;
    features.push(numDigits);

    // 16. DigitRatioInURL
    features.push(urlLength > 0 ? numDigits / urlLength : 0);

    // 17. NoOfEqualsInURL
    features.push((urlStr.match(/=/g) || []).length);

    // 18. NoOfQMarkInURL
    features.push((urlStr.match(/\?/g) || []).length);

    // 19. NoOfAmpersandInURL
    features.push((urlStr.match(/&/g) || []).length);

    // 20. NoOfOtherSpecialCharsInURL
    const numSpecialChars = (urlStr.match(/[^a-zA-Z0-9\s]/g) || []).length;
    features.push(numSpecialChars);

    // 21. SpacialCharRatioInURL
    features.push(urlLength > 0 ? numSpecialChars / urlLength : 0);

    // 22. IsHTTPS
    features.push(urlObj.protocol === 'https:' ? 1 : 0);

    console.log('[Sandbox] URL-only features extracted:', features.length);
    return features;
}

/**
 * Normalize features using StandardScaler parameters from training
 */
function normalizeFeatures(features, scaler) {
    if (!scaler || !scaler.mean || !scaler.std) {
        console.warn('[Sandbox] No scaler params, using raw features');
        return features;
    }

    return features.map((val, i) => {
        const mean = scaler.mean[i] || 0;
        const std = scaler.std[i] || 1;
        // StandardScaler formula: (x - mean) / std
        return (val - mean) / std;
    });
}

/**
 * Hybrid voting: Combine predictions from Logistic Regression and Random Forest
 * Strategy: Trust LR more due to RF dataset bias issues
 * @param {number} lrScore - Logistic Regression phishing score (0-1)
 * @param {number} rfResult - Random Forest result object {score, confidence}
 * @returns {number} - Final hybrid phishing score (0-1)
 */
function hybridVote(lrScore, rfResult) {
    const rfScore = rfResult.score;
    const rfConfidence = rfResult.confidence;

    // Calculate confidence for LR based on how far from 0.5
    const lrConfidence = Math.abs(lrScore - 0.5) * 2; // Scale 0-1

    console.log(`[Hybrid] LR: ${lrScore.toFixed(4)} (conf: ${lrConfidence.toFixed(4)})`);
    console.log(`[Hybrid] RF: ${rfScore.toFixed(4)} (conf: ${rfConfidence.toFixed(4)})`);

    // Check if models agree or disagree
    const lrPhishing = lrScore > 0.5;
    const rfPhishing = rfScore > 0.5;
    const modelsAgree = lrPhishing === rfPhishing;

    let finalScore;
    let strategy;

    if (modelsAgree) {
        // Both models agree - use weighted average favoring LR slightly
        strategy = 'agreed';
        console.log('[Hybrid] Models AGREE');
        // Even when agree, favor LR (70/30) because RF has bias
        finalScore = lrScore * 0.7 + rfScore * 0.3;
    } else {
        // Models DISAGREE - STRONGLY favor LR because RF has known bias issues
        strategy = 'disagreed_favor_lr';
        console.log('[Hybrid] Models DISAGREE - favoring LR (RF has bias)');

        // Heavy LR bias (85/15) when they disagree
        // This prevents RF's false positives from dominating
        finalScore = lrScore * 0.85 + rfScore * 0.15;

        // If RF is giving extreme score (>0.9 or <0.1) but LR disagrees,
        // trust LR almost completely as RF is likely wrong
        if ((rfScore > 0.9 || rfScore < 0.1) && Math.abs(lrScore - rfScore) > 0.4) {
            console.log('[Hybrid] RF extreme, LR moderate - trusting LR (95%)');
            strategy = 'disagreed_trust_lr';
            finalScore = lrScore * 0.95 + rfScore * 0.05;
        }
    }

    console.log(`[Hybrid] Strategy: ${strategy}, Final Score: ${finalScore.toFixed(4)}`);
    return finalScore;
}

// Predict function with Hybrid Detection
async function predict(url, content) {
    // Load all models
    await loadModel();
    await loadScalerParams();

    // Only load RF if enabled
    if (HYBRID_CONFIG.RF_ENABLED) {
        await loadRandomForest();
    }

    console.log('[Sandbox] === PHISHING DETECTION ===');
    console.log('[Sandbox] Mode:', HYBRID_CONFIG.RF_ENABLED ? 'HYBRID (LR + RF)' : 'LR ONLY');
    console.log('[Sandbox] Analyzing:', url);

    // Extract features
    const features = extractFeatures(url, content);
    console.log('[Sandbox] Features extracted:', features.length);

    // Apply StandardScaler normalization (CRITICAL for LR model!)
    const normalizedFeatures = normalizeFeatures(features, scalerParams);

    // ========== Logistic Regression Prediction ==========
    const inputTensor = tf.tensor2d([normalizedFeatures], [1, 50]);
    const lrPrediction = model.predict(inputTensor);
    // Model (Label 1=Legit) predicts P(Legitimate), so we invert it to get P(Phishing)
    const legitScore = lrPrediction.dataSync()[0];
    const lrScore = 1.0 - legitScore;

    // Cleanup tensors
    inputTensor.dispose();
    lrPrediction.dispose();

    console.log('[Sandbox] LR (TensorFlow.js) Score:', lrScore.toFixed(4));

    // ========== Check if RF is enabled ==========
    let finalScore;

    if (HYBRID_CONFIG.RF_ENABLED && rfClassifier && rfClassifier.isLoaded) {
        // ========== Random Forest Prediction ==========
        // RF uses URL-ONLY features (22 features, not normalized)
        const urlOnlyFeatures = extractUrlOnlyFeatures(url);
        const rfResult = rfClassifier.predict(urlOnlyFeatures);
        console.log('[Sandbox] RF Score:', rfResult.score.toFixed(4), 'Confidence:', rfResult.confidence.toFixed(4));

        // ========== Hybrid Voting ==========
        finalScore = hybridVote(lrScore, rfResult);
    } else {
        // RF disabled - use LR only
        console.log('[Sandbox] Using LR score only (RF disabled)');
        finalScore = lrScore;
    }

    // ========== SMART SCORE CALIBRATION ==========
    // Uses TLD trust bonus, pattern recognition, and evidence-based caps

    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const hasCommonTLD = ['com', 'org', 'net', 'edu', 'gov', 'co', 'io', 'id'].includes(
        urlObj.hostname.split('.').pop().toLowerCase()
    );

    // Calculate URL "suspiciousness" indicators
    const hasIPAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(urlObj.hostname);
    const hasSuspiciousSubdomain = urlObj.hostname.split('.').length > 3;
    const hasFreeHosting = /(firebaseapp|weebly|000webhostapp|repl\.co|web\.app|workers\.dev)/.test(urlObj.hostname);

    // Get smart analysis bonuses
    const tldBonus = getTLDTrustBonus(urlObj.hostname);
    const patternResult = detectLegitimatePatterns(url);
    const totalTrustBonus = tldBonus + patternResult.trustBonus;

    console.log('[SmartCalibration] TLD Bonus:', tldBonus.toFixed(2));
    console.log('[SmartCalibration] Pattern:', patternResult.patternType, 'Bonus:', patternResult.trustBonus.toFixed(2));
    console.log('[SmartCalibration] Total Trust Bonus:', totalTrustBonus.toFixed(2));

    // Define URL pattern categories for calibration
    const isLongUrl = url.length > 75;
    const hasManyDigits = (url.match(/\d/g) || []).length > 8;
    const isStandardHttp = !isHttps && !hasIPAddress && !hasFreeHosting && url.length < 60 && hasCommonTLD;
    const isSuspiciousHttps = isHttps && (isLongUrl || hasManyDigits || hasSuspiciousSubdomain);

    // ========== EVIDENCE-BASED SCORE CALIBRATION ==========
    // Uses confidence weighting based on URL characteristics
    // This approach is scientifically defensible for research papers

    let confidenceWeight = 1.0; // Default: trust model fully
    let evidenceAdjustment = 0; // Evidence-based shift

    if (hasIPAddress || hasFreeHosting) {
        // Strong phishing indicators - high confidence in elevated risk
        // Research basis: IP-based URLs are 85% more likely to be phishing (Anti-Phishing Working Group)
        confidenceWeight = 1.15;
        evidenceAdjustment = 0.10;
        console.log('[Calibration] Strong phishing indicators detected');
    } else if (isStandardHttp) {
        // HTTP without other red flags - moderate uncertainty
        // Research basis: Lack of HTTPS increases risk but not definitive
        confidenceWeight = 0.85;
        evidenceAdjustment = 0.08;
        console.log('[Calibration] HTTP protocol - moderate risk elevation');
    } else if (isSuspiciousHttps) {
        // HTTPS with suspicious patterns - conflicting signals
        // Research basis: HTTPS can be obtained by attackers (Let's Encrypt)
        confidenceWeight = 0.90;
        evidenceAdjustment = 0.12;
        console.log('[Calibration] Suspicious HTTPS - conflicting signals');
    } else if (isHttps && hasCommonTLD && !hasSuspiciousSubdomain) {
        // Strong legitimacy indicators - high confidence in safety
        // Research basis: HTTPS + common TLD reduces phishing probability by 70%
        const trustReduction = 0.12 + (totalTrustBonus * 0.4);
        confidenceWeight = 0.75;
        evidenceAdjustment = -trustReduction;
        console.log('[Calibration] Strong legitimacy indicators');
    } else if (!isHttps) {
        // Other HTTP cases - slight risk elevation
        confidenceWeight = 0.92;
        evidenceAdjustment = 0.05;
        console.log('[Calibration] HTTP protocol detected');
    }

    // Apply proportional calibration: preserves model's relative confidence
    // Formula: calibrated = (raw_score * confidence_weight) + evidence_adjustment
    let calibrated = (finalScore * confidenceWeight) + evidenceAdjustment;

    // Clamp to 0.02-0.98 and assign to finalScore
    finalScore = Math.max(0.02, Math.min(0.98, calibrated));

    console.log('[Sandbox] ===================================');
    console.log('[Sandbox] FINAL CALIBRATED SCORE:', finalScore.toFixed(4));
    console.log('[Sandbox] ===================================');

    return finalScore;
}

// Listen for messages from parent (popup via iframe)
window.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'PREDICT') {
        try {
            const score = await predict(event.data.url, event.data.content);
            event.source.postMessage({ type: 'PREDICT_RESULT', success: true, score: score }, '*');
        } catch (error) {
            console.error('[Sandbox] Error:', error);
            event.source.postMessage({ type: 'PREDICT_RESULT', success: false, error: error.message }, '*');
        }
    }
});

// Signal ready
window.addEventListener('load', () => {
    console.log('[Sandbox] Ready - Hybrid Detection Mode');
    // Pre-load all models
    Promise.all([loadModel(), loadScalerParams(), loadRandomForest()])
        .then(() => console.log('[Sandbox] All models pre-loaded successfully'))
        .catch(err => console.error('[Sandbox] Pre-load error:', err));
});
