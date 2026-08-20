# SignConnect — Real-Time ISL Interpreter for Government Service Counters

SignConnect is a two-way communication system for government service counters. A citizen signs, the camera reads the gesture and shows staff what was said in text (and speech). Staff replies out loud, and the citizen sees a simplified text reply. It's built for a fixed, high-frequency counter vocabulary — not open ISL translation — so it can actually be trained and deployed on a hackathon timeline.

**Live demo:** https://sign-connect-virid.vercel.app 

**Backend:** https://signconnect-backend.onrender.com

---

## The problem

- **63M+** Deaf / hard-of-hearing citizens in India (WHO), and **under 300** certified ISL interpreters nationwide (ISLRTC).
- The **RPWD Act, 2016** mandates accessible communication at public institutions — with no scalable technology to meet that mandate today.
- Today's only real options at a counter: bring a hearing companion, wait for a rare interpreter, or don't communicate at all.

## What SignConnect does

**Citizen → Staff**
1. Camera captures the citizen's hand gestures.
2. MediaPipe Hands extracts 21 landmarks per hand (both hands tracked).
3. A Random Forest classifier, trained on our own recorded landmark data, predicts the sign.
4. Five frames are sampled and majority-voted for a more stable prediction, then shown as text to staff and read aloud via speech synthesis.

**Staff → Citizen**
1. Staff taps "Speak Reply" and talks normally.
2. The browser's native Web Speech API transcribes it live, client-side.
3. The transcript is shown to the citizen as simple text.

## Current vocabulary

`hello` · `yes` · `no` · `thankyou` · `wait` · `welcome`

This is deliberately small and fixed. The goal isn't to translate all of ISL — it's to cover the handful of high-frequency exchanges that happen at every counter (greeting, confirmation, waiting), prove the pipeline works end-to-end, and expand the vocabulary from there. Planned next additions: `documents`, `ID`, `payment`, `form`, `signature`, `help`.

## Architecture

```
                    CITIZEN → STAFF
┌──────────┐   ┌───────────────┐   ┌──────────────────┐   ┌───────────────┐
│  Camera  │──▶│ MediaPipe     │──▶│ Random Forest      │──▶│ Text + speech │
│ (5 frames│   │ Hands         │   │ classifier          │   │ shown to      │
│  burst)  │   │ (126 features)│   │ (majority vote /5) │   │ staff         │
└──────────┘   └───────────────┘   └──────────────────┘   └───────────────┘

                    STAFF → CITIZEN
┌──────────┐   ┌────────────────────┐   ┌───────────────┐
│  Staff   │──▶│ Browser Web Speech  │──▶│ Text shown to │
│  speech  │   │ API (client-side)   │   │ citizen       │
└──────────┘   └────────────────────┘   └───────────────┘
```

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Computer vision | MediaPipe Hands | Pretrained, 21 landmarks/hand, both hands tracked (126-feature vector) |
| Classifier | scikit-learn `RandomForestClassifier` (200 estimators) | Trained on landmark coordinates, not raw video |
| Backend | FastAPI | Single `/predict` endpoint, image in → prediction + confidence out |
| Speech (staff → citizen) | Web Speech API `SpeechRecognition` | Native browser STT, client-side, no external API |
| Speech (citizen → staff) | Web Speech API `SpeechSynthesis` | Native browser TTS |
| Frontend | React + Vite, Tailwind CSS | Live camera feed, capture button, prediction + staff-reply panels |
| Data collection | OpenCV + MediaPipe (`collect_data.py`) | Custom recording tool for building the landmark dataset |
| Backend hosting | Render | `signconnect-backend.onrender.com` |
| Frontend hosting | Vercel | `sign-connect-virid.vercel.app` |

## Repository structure

```
SignConnect/
├── signconnect-backend/
│   ├── main.py              # FastAPI app — /predict endpoint
│   ├── collect_data.py      # Records landmark samples per sign into landmark_data.csv
│   ├── train_model.py       # Trains RandomForestClassifier, prints accuracy, saves sign_model.pkl
│   ├── sign_model.pkl       # Trained model
│   ├── landmark_data.csv    # Collected training data
│   └── requirements.txt
└── signconnect-frontend/
    ├── src/
    │   └── App.jsx           # Camera feed, capture flow, staff speech-to-text panel
    └── package.json
```

## Model details

- **Input:** 126-dim feature vector — `[left_hand_x0,y0,z0, ..., x20,y20,z20, right_hand_x0,y0,z0, ..., x20,y20,z20]`, zero-padded when a hand isn't detected.
- **Model:** `RandomForestClassifier(n_estimators=200, random_state=42)`
- **Data:** ~100 samples per sign, collected via `collect_data.py`, one signer.
- **Split:** 80/20 stratified train/test.
- **Test accuracy:** ~98% on held-out test split (single signer, 6-sign vocabulary — see caveat below)

**Why Random Forest, not an LSTM/transformer:** the current pipeline classifies static, single-frame hand poses (majority-voted across a 5-frame burst), not continuous temporal sequences. For an isolated, small, fixed vocabulary, a Random Forest reaches usable accuracy with far less data and inference cost than a sequence model. If the vocabulary grows to include signs that are only distinguishable by motion over time, a lightweight temporal model (e.g. a small GRU) is the planned next step.

## Known limitations & honest scope

- **98% test accuracy is on a single-signer, same-session split** — the train/test split is random, not by signer, so this number reflects how well the model recognizes *the same person's* signing style, not generalization to new signers yet. Framed honestly to judges: "98% validates the pipeline works; the next step is multi-signer data to test real-world generalization."
- Trained on a single signer so far — accuracy on other signers is untested. Next step: multi-signer data collection.
- Confidence-threshold fallback is now implemented (`CONFIDENCE_THRESHOLD = 0.6` in `main.py`) — low-confidence predictions return "please repeat the sign" instead of a shaky guess.
- CORS is currently open (`allow_origins=["*"]`) for development; would be scoped down for a real deployment.
- Vocabulary is intentionally narrow (6 signs) — this is an MVP screening of the two-way pipeline, not an ISL translation system. ISL-CSLRT/INCLUDE are the planned path to scaling vocabulary post-pilot, not integrated yet — deliberately, to keep the working pipeline stable.
- Speech recognition depends on the Web Speech API, which requires Chrome/Chromium-based browsers and an internet connection for the underlying recognition service.
- **Backend is hosted on Render's free tier**, which sleeps after ~15 minutes of inactivity — first request after idle can take 30-50s to wake up. Not a code limitation, just a demo-day logistics note.

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check — `{"message": "SignConnect API is running"}` |
| `GET` | `/signs` | Returns the currently supported sign vocabulary |
| `POST` | `/predict` | Image in (multipart form, `file`) → `{prediction, confidence}`, or a low-confidence/no-hand message |

## Running locally

**Backend**
```bash
cd signconnect-backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**
```bash
cd signconnect-frontend
npm install
npm run dev
```
Set `VITE_API_URL` in a `.env` file in `signconnect-frontend/` to point at your backend (e.g. `http://localhost:8000` locally, or the Render URL in production).

**Collecting more training data / retraining**
```bash
cd signconnect-backend
python collect_data.py     # records landmark samples for each sign in SIGNS
python train_model.py      # retrains and overwrites sign_model.pkl, prints test accuracy
```

## References

- Rights of Persons with Disabilities Act, 2016 — Government of India
- ~63 million deaf/hard-of-hearing individuals in India — WHO estimate
- Under 300 certified interpreters nationwide — ISLRTC, Ministry of Social Justice & Empowerment
- ISL-CSLRT dataset, INCLUDE dataset (IIT) — reference datasets for future vocabulary expansion
