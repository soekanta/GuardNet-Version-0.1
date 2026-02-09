# 🚀 Google Colab - Fixed Pipeline (No Data Leakage)

## 📋 Cara Menggunakan

### Opsi 1: Copy-Paste Manual (Recommended)

1. **Buka Google Colab**: https://colab.research.google.com/
2. **Buat notebook baru**: File → New notebook
3. **Buka file**: `colab_fixed_pipeline.py`
4. **Copy setiap CELL** (ada 18 cells) ke Colab:
   - Setiap section yang dimulai dengan `# CELL X:` adalah 1 cell
   - Copy kode di bawah comment tersebut ke cell baru di Colab
5. **Jalankan**: Runtime → Run all
6. **Upload dataset** ketika diminta

### Opsi 2: Upload Script Langsung

1. Upload `colab_fixed_pipeline.py` ke Colab
2. Jalankan dengan `!python colab_fixed_pipeline.py`
3. Upload dataset ketika diminta

---

## 📊 Output yang Dihasilkan

### 9 Grafik Publication-Ready:
1. `01_class_distribution.png`
2. `02_performance_metrics.png` - **URL-only features**
3. `03_confusion_matrices.png`
4. `04_roc_curves.png`
5. `05_precision_recall_curves.png`
6. `06_feature_importance.png` - **Top 20 URL features**
7. `07_learning_curve.png` - **FIXED (Pipeline)**
8. `08_score_distribution.png`
9. `09_cross_validation.png` - **FIXED (Pipeline)**

### Model Files:
- `lr_pipeline.pkl` - Logistic Regression Pipeline
- `rf_pipeline.pkl` - Random Forest Pipeline
- `training_report_fixed.json` - Summary metrics

---

## ✅ Perbaikan yang Diterapkan

| Aspek | Old | Fixed |
|-------|-----|-------|
| **Pipeline** | Manual scaling ❌ | sklearn Pipeline ✅ |
| **Features** | All (50+) | URL-only (22) ✅ |
| **Cross-validation** | Pre-scaled data ❌ | Pipeline ✅ |
| **Learning curve** | Pre-scaled data ❌ | Pipeline ✅ |
| **Data leakage** | YES ❌ | NO ✅ |

---

## ⚠️ PENTING

**Metrics akan lebih rendah** dari script sebelumnya - ini **NORMAL** dan **BENAR**!

- Script lama: Data leakage → inflated scores (98-99%)
- Script baru: No leakage → **TRUE** performance (93-95%)

---

## 💡 Tips

### Jika Memory Error:
Tambahkan sampling di CELL 4:
```python
# Setelah: df = pd.read_csv(dataset_file)
df = df.sample(n=50000, random_state=42)
```

### Untuk Training Lebih Cepat:
Edit di CELL 6:
```python
# Kurangi n_estimators
RandomForestClassifier(n_estimators=50, ...)  # dari 100
```

---

## 📝 Untuk Paper

**Gunakan grafik dari script ini** karena:
✅ No data leakage
✅ Proper cross-validation
✅ URL-only features (reproducible)
✅ sklearn Pipeline (best practice)

**Jangan gunakan** grafik dari `train_with_visualizations.py` (ada data leakage)

---

**Good luck! 🎓📊**
