# Dokumentasi Proyek GuardNet (PlanFix)

Dokumen ini merangkum rencana implementasi, struktur proyek, dan panduan penggunaan untuk pengembangan Ekstensi Chrome GuardNet.

## 1. Tujuan Proyek
Membuat ekstensi Chrome yang mampu mendeteksi URL phishing secara *real-time* menggunakan model Machine Learning (TensorFlow.js) yang berjalan sepenuhnya di sisi klien (offline-capable).

## 2. Arsitektur Teknis
Karena kebijakan keamanan Chrome Manifest V3 yang ketat (Content Security Policy), kita menggunakan arsitektur **Offscreen Document** dan **Sandbox** untuk menjalankan model TensorFlow.js.

### Diagram Alur Kerja

```mermaid
graph TD
    User[User Membuka Web] -->|Klik Ikon| Popup["Popup UI (popup.html)"]
    Popup -->|Klik Scan| Logic["Popup Logic (popup.js)"]
    Logic -->|1. Fetch HTML| Tab[Active Tab Content]
    Tab -->|Return HTML String| Logic
    Logic -->|2. Send {URL, HTML}| Iframe["Hidden Sandbox Iframe (sandbox.html)"]
    Iframe -->|3. Extract Features| Extractor["Feature Extractor (sandbox.js)"]
    Extractor -->|50 Numeric Features| TFJS[TensorFlow.js Model]
    TFJS -->|Prediction Score| Iframe
    Iframe -->|4. Post Message| Logic
    Logic -->|5. Update UI| UIResult["Tampilan Hasil (Aman/Phishing)"]
```

## 3. Implementasi Fitur (50 Fitur)
Model membutuhkan 50 fitur numerik sebagai input. Fitur ini diekstrak dari **URL** dan **Konten Halaman**.

| Kategori | Contoh Fitur | Implementasi |
|---|---|---|
| **URL-Based** | `URLLength`, `NoOfSubDomain`, `IsHTTPS` | Analisis string URL langsung. |
| **Content-Based** | `NoOfImage`, `NoOfiFrame`, `HasPasswordField` | Parsing HTML menggunakan DOMParser. |
| **Statistical** | `URLCharProb` | Diaproksimasi menggunakan entropi karakter. |

## 4. Struktur File Proyek

```
GuardNet/
├── manifest.json       # Konfigurasi ekstensi (Manifest V3)
├── popup.html          # Antarmuka pengguna (UI)
├── popup.js            # Logika UI & komunikasi dengan sandbox
├── style.css           # Styling untuk popup
├── sandbox.html        # Halaman terisolasi untuk menjalankan TensorFlow.js
├── sandbox.js          # Logika ekstraksi fitur & prediksi model
├── background.js       # Service worker (jika diperlukan untuk ekspansi)
├── libs/
│   └── tf.min.js       # Library TensorFlow.js (offline)
└── models/             # File model ML
    ├── model.json
    └── group1-shard1of1.bin
```

## 5. Panduan Pengujian (Walkthrough)

1.  **Instalasi**:
    *   Buka `chrome://extensions/` di browser Chrome.
    *   Aktifkan **Developer mode** (pojok kanan atas).
    *   Klik **Load unpacked** dan pilih folder `GuardNet`.

2.  **Cara Menggunakan**:
    *   Buka website apa saja (contoh: `google.com` atau website test phishing).
    *   Klik ikon **GuardNet** di toolbar browser.
    *   Klik tombol **Scan Current Tab**.
    *   Tunggu hasil analisis (Aman/Phishing).

3.  **Troubleshooting**:
    *   Jika muncul error "Model bad input", pastikan format `model.json` menggunakan `batch_input_shape`.
    *   Jika skor selalu sama (~63%), berarti ekstraksi fitur belum berjalan (masih dummy). Pastikan `sandbox.js` terbaru sudah terpasang.

## 6. Catatan Keamanan
Ekstensi ini menggunakan izin `activeTab` dan `scripting` hanya saat pengguna mengklik tombol scan, menjaga privasi pengguna dengan tidak memindai secara otomatis di latar belakang tanpa izin.
