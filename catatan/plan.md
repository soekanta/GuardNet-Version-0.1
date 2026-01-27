Implementation Plan - GuardNet Chrome Extension
This plan outlines the steps to build the GuardNet Chrome Extension, a phishing URL detection tool using a pre-trained TensorFlow.js model.

User Review Required
IMPORTANT

Model Path: The user stated the model is at model/model.json, but the filesystem currently shows models/. I will assume we should use the existing models/ directory to avoid file duplication, but I will structure the code to look for it there or rename the directory if preferred. For this plan, I will use models/ in the code paths to match the current actual state.

NOTE

TensorFlow.js Library: I will attempt to download tf.min.js from a CDN to libs/ to ensure offline capability as requested.

Proposed Changes
Project Structure
root/
manifest.json: Configuration for the extension.
popup.html: The UI for the extension.
popup.js: Logic for loading the model and prediction.
style.css: Styling for the popup.
libs/: Directory for third-party libraries.
tf.min.js: TensorFlow.js library.
models/: Existing directory containing 
model.json
 and binary shards.
[Manifest]
[NEW] 
manifest.json
Version 3.
Permissions: activeTab, scripting.
CSP: script-src 'self' 'wasm-unsafe-eval'; object-src 'self'.
[UI]
[NEW] 
popup.html
Clean interface with Status, Confidence Score, and Scan button.
[NEW] 
style.css
Modern styling (green/red indicators, nice typography).
[Logic]
[NEW] 
popup.js
Import tf.min.js.
loadModel(): Loads from 
./models/model.json
.
extractFeatures(url): Placeholder returning 50 zeros (matching the shape found in analysis).
Click listener for "Scan" button.
[Libraries]
[NEW] 
libs/tf.min.js
Downloaded from CDN (e.g., https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/dist/tf.min.js).
Verification Plan
Manual Verification
Load the extension in Chrome (Developer Mode).
Open the popup on a safe site and a "phishing" site (simulated).
Click "Scan".
Check if "Aman" or "Phishing" appears.
Check Console for any CSP errors or model loading errors.