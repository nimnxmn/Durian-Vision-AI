# DurianVision AI 

**DurianVision AI** is an end-to-end computer vision web application designed to automate the detection and counting of durians in orchard environments. Built with YOLOv8, this tool assists farmers and agricultural analysts in estimating crop yields quickly and accurately.

🚀 **Live Demo:** [Click here to try the app](https://durian-vision-ai.streamlit.app/)

---

## Features
- **Automatic Detection:** Accurately identifies and bounds multiple durians within a single image.
- **One-Click Demo:** Integrated sample dataset allowing users to test the AI instantly without uploading their own images.
- **Batch Processing:** Supports multiple simultaneous image uploads for bulk analysis.
- **Yield Analytics:** Provides individual image detection counts and aggregates total cumulative detections.

## Data Acquisition Constraints (Best Practices)
For optimal feature extraction and model accuracy, images should be captured adhering to the following conditions:
- **Perspective:** Captured from a **nadir-to-canopy** angle (standing directly beneath the tree and looking upwards).
- **Lighting:** Sufficient natural daylight to ensure fruit features are clearly distinguishable from the background foliage.

## Tech Stack
- **AI/Computer Vision:** YOLOv8 (Ultralytics), OpenCV, PIL
- **Web Framework:** Streamlit
- **Language:** Python 3.11

## 📂 Project Structure
```text
├── DurianVisionAI.py     # Main Streamlit application script
├── best.pt               # Fine-tuned YOLOv8 model weights
├── requirements.txt      # Python dependencies
├── demo_image.jpg        # Default image for the interactive demo
├── sample_images/        # Directory containing test images for evaluation
└── README.md             # Project documentation
