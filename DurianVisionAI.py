import streamlit as st
from ultralytics import YOLO
from PIL import Image
import cv2
import numpy as np
import os  # Library for demo

# 1. Page Configuration
st.set_page_config(
    page_title="DurianVision AI", layout="wide")

# 2. Sidebar - Information & Interactive Demo
with st.sidebar:
    st.title("Application Info")
    st.info("""
        **DurianVision AI** is a specialized computer vision tool designed 
        to automate the process of counting durians from orchard images.
    """)

    st.warning("""
        ### Best Practices
        To ensure optimal feature extraction, images must be captured from a nadir-to-canopy perspective (directly beneath the tree looking upwards).
    """)

    st.divider()

    # Interactive Demo Button
    st.subheader("Quick Demo")
    st.write("Don't have a photo? Test the AI instantly:")
    run_demo = st.button("Run with Sample Image", use_container_width=True)


# 3. Model Loading
@st.cache_resource
def load_model():
    return YOLO('best.pt')


model = load_model()

# 4. Main UI
st.title("AI Durian Detection & Counting System")

uploaded_files = st.file_uploader(
    "Choose Durian Tree Images (Batch upload supported)",
    accept_multiple_files=True,
    type=['jpg', 'png', 'jpeg']
)

st.divider()

# Option 1: Demo
if run_demo:
    sample_path = "samples/demo_image.jpg"

    if os.path.exists(sample_path):  # check if demo image exists
        st.success("Running demonstration with sample dataset...")
        with st.spinner('AI is analyzing the canopy...'):
            image = Image.open(sample_path)
            results = model.predict(image, conf=0.25)

            count = len(results[0].boxes)
            res_plotted = results[0].plot()
            res_rgb = cv2.cvtColor(res_plotted, cv2.COLOR_BGR2RGB)

            st.subheader("📊 Demo Results")
            c1, c2 = st.columns([3, 1])
            c1.image(res_rgb, caption="Sample Image: demo_image.jpg",
                     use_container_width=True)
            c2.metric("Detected Durians", f"{count}")
    else:
        st.error(
            "⚠️ Demo image not found! Please check if 'samples/demo_image.jpg' exists.")

# Option 2: Uploaded Images
elif uploaded_files:
    cols = st.columns(len(uploaded_files) if len(uploaded_files) <= 2 else 2)
    total_detections = 0

    for idx, file in enumerate(uploaded_files):
        with st.spinner(f'Processing {file.name}...'):
            image = Image.open(file)
            results = model.predict(image, conf=0.25)

            count = len(results[0].boxes)
            total_detections += count

            res_plotted = results[0].plot()
            res_rgb = cv2.cvtColor(res_plotted, cv2.COLOR_BGR2RGB)

            with st.container():
                st.subheader(f"Results: {file.name}")
                c1, c2 = st.columns([3, 1])
                c1.image(res_rgb, use_container_width=True)
                c2.metric("Detected Durians", f"{count}")
                st.write("---")

    st.success(f"### Final Analytics Summary")
    col_a, col_b = st.columns(2)
    col_a.metric("Total Images Processed", len(uploaded_files))
    col_b.metric("Total Durians Detected", f"{total_detections}")

# Option 3: Default View
else:
    st.info(
        "👋 Welcome! Please upload your tree images or click the Demo button to start.")
