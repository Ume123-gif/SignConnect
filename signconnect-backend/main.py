from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import cv2
import mediapipe as mp
import numpy as np
import pickle

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

with open("sign_model.pkl", "rb") as f:
    model = pickle.load(f)

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)

def extract_landmarks(image):

    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb_image)

    if not results.multi_hand_landmarks:
        return None

    left_hand = [0.0] * 63
    right_hand = [0.0] * 63

    for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
        handedness = results.multi_handedness[idx].classification[0].label
        coords = []
        for lm in hand_landmarks.landmark:
            coords += [lm.x, lm.y, lm.z]

        if handedness == "Left":
            left_hand = coords
        else:
            right_hand = coords

    return left_hand + right_hand

@app.get("/")
def home():
    return {"message": "SignConnect API is running"}

@app.post("/predict")
async def predict_sign(file: UploadFile = File(...)):

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    features = extract_landmarks(image)

    if features is None:
        return {"prediction": None, "message": "No hand detected"}

    features_array = np.array(features).reshape(1, -1)

    prediction = model.predict(features_array)[0]
    confidence = model.predict_proba(features_array).max()

    return {
        "prediction": prediction,
        "confidence": round(float(confidence), 2)
    }
    