# Real-ESRGAN General x4v3 CNN

- Arquitectura: SRVGGNetCompact (CNN), salida nativa 4× reducida a 2× con antialiasing.
- Fuente de los pesos: Real-ESRGAN v0.2.5.0, `realesr-general-x4v3.pth`.
- Exportación ONNX reproducible: https://huggingface.co/CoderViking/realesr-general-x4v3-onnx
- Licencia original: BSD 3-Clause, Real-ESRGAN / Tencent ARC Lab.
- SHA-256 del archivo ONNX incluido: `1940a93ee08283a0a7286183186357b1688fe9fa8ede74604b424586aaddf112`.
- `model-x2.onnx` (usado desde v61): los mismos pesos con un AveragePool 2×2 al final, generado con `scripts/make-cnn-x2.py`. Entrega directamente la imagen ×2 (resultado de 8 bits idéntico al promedio anterior) y copia 4 veces menos datos desde la GPU. SHA-256: `1278a99269014f65375f18be4e0fcbf198d86b6b7f74f0cf064786cc3f8e25e8`.
