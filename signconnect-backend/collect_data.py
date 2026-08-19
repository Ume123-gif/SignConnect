import cv2
import mediapipe as mp
import csv
import os

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)
mp_drawing = mp.solutions.drawing_utils

SIGNS = ["hello", "yes", "no", "thankyou", "wait", "welcome"]
SAMPLES_PER_SIGN = 100

DATA_FILE = "landmark_data.csv"

if not os.path.exists(DATA_FILE):
    header = ["label"]
    for hand in ["left", "right"]:
        for i in range(21):
            header += [f"{hand}_x{i}", f"{hand}_y{i}", f"{hand}_z{i}"]
    with open(DATA_FILE, "w", newline="") as f:
        csv.writer(f).writerow(header)

cap = cv2.VideoCapture(0)

for sign in SIGNS:
    print(f"\n=== Get ready to sign: {sign.upper()} ===")
    print("Print 's' to START capturing 50 samples for this sign.")

    collected = 0
    capturing = False

    while collected < SAMPLES_PER_SIGN:
        success, frame = cap.read()
        if not success:
            continue

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)

        cv2.putText(frame, f"Sign: {sign} | Collected: {collected}/{SAMPLES_PER_SIGN}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

            if capturing:
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

                row = [sign] + left_hand + right_hand
                with open(DATA_FILE, "a", newline="") as f:
                    csv.writer(f).writerow(row)

                collected += 1

        cv2.imshow("SignConnect - Data Collection", frame)

        key = cv2.waitKey(1) & 0xFF 
        if key == ord('s'):
            capturing = True
        elif key == ord('q'):
            break

    print(f"Done collecting '{sign}'. Move to next sign in 2 seconds...")
    cv2.waitKey(2000)

cap.release()
cv2.destroyAllWindows()
print("\nAll data collected! Check landmark_data.csv")
