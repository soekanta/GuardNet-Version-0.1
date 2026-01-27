/**
 * GuardNet V.01 - Random Forest Classifier (Pure JavaScript)
 * Lightweight implementation for client-side phishing detection
 * 
 * This module provides a Random Forest classifier that runs entirely in the browser.
 * The model structure is loaded from a JSON file containing pre-trained decision trees.
 */

class RandomForestClassifier {
    constructor() {
        this.trees = [];
        this.featureNames = [];
        this.nEstimators = 0;
        this.maxDepth = 0;
        this.isLoaded = false;
    }

    /**
     * Load the Random Forest model from JSON
     * @param {string} modelPath - Path to the rf_model.json file
     */
    async loadModel(modelPath) {
        try {
            console.log('[RandomForest] Loading model from:', modelPath);
            const response = await fetch(modelPath);
            const modelData = await response.json();

            this.trees = modelData.trees;
            this.featureNames = modelData.feature_names || [];
            this.nEstimators = modelData.n_estimators || this.trees.length;
            this.maxDepth = modelData.max_depth || 5;
            this.isLoaded = true;

            console.log(`[RandomForest] Model loaded: ${this.nEstimators} trees, max_depth=${this.maxDepth}`);
            return true;
        } catch (error) {
            console.error('[RandomForest] Failed to load model:', error);
            this.isLoaded = false;
            return false;
        }
    }

    /**
     * Traverse a single decision tree
     * @param {Object} node - Current node in the tree
     * @param {number[]} features - Feature array
     * @returns {number[]} - Probability array [prob_legit, prob_phishing]
     */
    traverseTree(node, features) {
        // Leaf node - return the probability
        if (node.value !== undefined) {
            return node.value;
        }

        // Decision node - traverse left or right based on threshold
        const featureValue = features[node.featureIndex];

        if (featureValue <= node.threshold) {
            return this.traverseTree(node.left, features);
        } else {
            return this.traverseTree(node.right, features);
        }
    }

    /**
     * Predict using all trees and aggregate results
     * @param {number[]} features - Feature array (50 features)
     * @returns {Object} - { score: phishing probability, confidence: prediction confidence }
     */
    predict(features) {
        if (!this.isLoaded || this.trees.length === 0) {
            console.warn('[RandomForest] Model not loaded, returning neutral score');
            return { score: 0.5, confidence: 0 };
        }

        // Collect predictions from all trees
        const predictions = this.trees.map(tree => this.traverseTree(tree, features));

        // Calculate average probability across all trees
        let sumPhishing = 0;
        let sumLegit = 0;

        for (const pred of predictions) {
            // sklearn's predict_proba outputs [P(class_0), P(class_1)]
            // In our dataset: class_0 = Phishing (label=0), class_1 = Legitimate (label=1)
            // So: pred[0] = P(Phishing), pred[1] = P(Legitimate)
            if (Array.isArray(pred)) {
                sumPhishing += pred[0];  // FIXED: pred[0] is phishing probability
                sumLegit += pred[1];      // pred[1] is legitimate probability
            } else {
                // Single value = phishing probability
                sumPhishing += pred;
                sumLegit += (1 - pred);
            }
        }

        const avgPhishing = sumPhishing / predictions.length;
        const avgLegit = sumLegit / predictions.length;

        // Calculate confidence based on agreement between trees
        // Higher confidence when trees agree more strongly
        const probabilities = predictions.map(p => Array.isArray(p) ? p[0] : p); // FIXED: use index 0
        const mean = avgPhishing;
        const variance = probabilities.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / predictions.length;
        const stdDev = Math.sqrt(variance);

        // Confidence: 1 = perfect agreement, 0 = maximum disagreement
        // We use inverse of stdDev normalized to 0-1 range
        const confidence = Math.max(0, 1 - (stdDev * 2));

        console.log(`[RandomForest] Prediction: ${avgPhishing.toFixed(4)}, StdDev: ${stdDev.toFixed(4)}, Confidence: ${confidence.toFixed(4)}`);

        return {
            score: avgPhishing,
            confidence: confidence,
            treePredictions: probabilities
        };
    }

    /**
     * Get voting statistics for debugging
     * @param {number[]} features - Feature array
     * @returns {Object} - Detailed voting information
     */
    getVotingStats(features) {
        if (!this.isLoaded) {
            return { error: 'Model not loaded' };
        }

        const predictions = this.trees.map(tree => {
            const result = this.traverseTree(tree, features);
            return Array.isArray(result) ? result[0] : result; // FIXED: use index 0 for phishing
        });

        const phishingVotes = predictions.filter(p => p > 0.5).length;
        const legitVotes = predictions.filter(p => p <= 0.5).length;

        return {
            totalTrees: this.trees.length,
            phishingVotes: phishingVotes,
            legitVotes: legitVotes,
            agreement: Math.max(phishingVotes, legitVotes) / this.trees.length,
            predictions: predictions
        };
    }
}

// Export for use in sandbox.js
if (typeof window !== 'undefined') {
    window.RandomForestClassifier = RandomForestClassifier;
}
