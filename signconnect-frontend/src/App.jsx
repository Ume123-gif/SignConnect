import { useRef, useState, useEffect } from "react";

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [prediction, setPrediction] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("ready");
  const [errorMessage, setErrorMessage] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [staffText, setStaffText] = useState("");
  const [signVideos, setSignVideos] = useState([]);
  const [currentSign, setCurrentSign] = useState(0);

  const signMappings = {
  "thank you": ["/signs/thankyou.mp4"],
  "please wait": ["/signs/please.mp4", "/signs/wait.mp4"],
  "please": ["/signs/please.mp4"],
  "wait": ["/signs/wait.mp4"],
  "welcome": ["/signs/welcome.mp4"],
  };

  function showSign() {
    const text = staffText
      .trim()
      .toLowerCase()
      .replace(/[.,!?]/g, "");

    if (signMappings[text]) {
      setSignVideos(signMappings[text]);
      setCurrentSign(0);
    } else {
      setSignVideos([]);
      alert("This phrase is not available in the current ISL vocabulary.");
    }
  }

  useEffect(() => {
    let stream;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access error:", err);
        setErrorMessage("Unable to access camera");
        setStatus("error");
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  function speakPrediction(word) {
    if (!word) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser. Try Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setStaffText(transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognition.start();
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });
  }

  async function captureAndPredict() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    if (video.readyState < 2) {
      setErrorMessage("Camera is not ready yet");
      setStatus("error");
      return;
    }

    setLoading(true);
    setStatus("detecting");
    setErrorMessage(null);
    setPrediction(null);
    setConfidence(null);

    let lastMessage = "No hand detected"

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Unable to access canvas");
      }

      const predictions = [];

      for (let i = 0; i < 5; i++) {
        ctx.drawImage(
          video,
          0,
          0,
          canvas.width,
          canvas.height
        );

        const blob = await canvasToBlob(canvas);

        if (!blob) {
          continue;
        }

        const formData = new FormData();
        formData.append("file", blob, `frame_${i}.jpg`);

        const response = await fetch
        (`${import.meta.env.VITE_API_URL}/predict`, {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();

        if (data.prediction !== null) {
          predictions.push({
            prediction: data.prediction,
            confidence: data.confidence,
          });
        } else if (data.message) {
          lastMessage = data.message;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 100)
        );
      }

      if (predictions.length === 0) {
        setPrediction(null);
        setConfidence(null);
        setErrorMessage(lastMessage);
        setStatus("ready");
        return;
      }

      const counts = {};

      predictions.forEach((item) => {
        counts[item.prediction] =
          (counts[item.prediction] || 0) + 1;
      });

      let majorityPrediction = null;
      let maxCount = 0;

      for (const prediction in counts) {
        if (counts[prediction] > maxCount) {
          maxCount = counts[prediction];
          majorityPrediction = prediction;
        }
      }

      const majorityPredictions = predictions.filter(
        (item) => item.prediction === majorityPrediction
      );

      const averageConfidence =
        majorityPredictions.reduce(
          (sum, item) => sum + item.confidence,
          0
        ) / majorityPredictions.length;

      setPrediction(majorityPrediction);
      setConfidence(averageConfidence);
      setStatus("detected");

      speakPrediction(majorityPrediction);
    } catch (err) {
      console.error("Prediction error:", err);

      setPrediction(null);
      setConfidence(null);
      setErrorMessage(
        "Could not connect to the prediction server"
      );
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

return (
  <div className="min-h-screen bg-[#0B1F33] text-white flex flex-col items-center px-6 py-6 gap-5">

    {/* Header */}
    <header className="w-full max-w-6xl text-center">
      <h1 className="text-3xl font-bold tracking-tight">
        SignConnect
      </h1>

      <p className="text-sm text-[#8FAFC0] mt-1">
        Real-time two-way ISL communication
      </p>
    </header>

    {/* TWO-WAY COMMUNICATION */}
    <div className="w-full max-w-6xl grid grid-cols-2 gap-5">

      {/* ================= LEFT: CITIZEN → STAFF ================= */}
      <div className="bg-[#132C47] border border-[#1C4368] rounded-2xl p-5">

        <div className="text-center mb-4">
          <p className="text-xs uppercase tracking-widest text-[#E8871E] font-semibold">
            Citizen → Staff
          </p>

          <p className="text-sm text-[#8FAFC0] mt-1">
            Sign language recognition
          </p>
        </div>

        {/* Camera */}
        <div className="relative w-full">

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-video object-cover rounded-xl border border-[#1C4368]"
          />

          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur px-2.5 py-1 rounded-full text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Camera ready
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-[#E7EEF3]">
            Place your hand clearly inside the frame
          </div>

        </div>


        <canvas ref={canvasRef} className="hidden" />

        {/* Capture button */}
        <button
          onClick={captureAndPredict}
          disabled={loading}
          className="w-full mt-4 bg-[#E8871E] hover:bg-[#D67A15] active:scale-[0.98] disabled:bg-[#3E4C58] disabled:cursor-not-allowed px-6 py-3.5 rounded-lg font-semibold text-[#0B1F33] disabled:text-white transition-all flex items-center justify-center gap-2"
        >

          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Detecting sign…
            </>
          ) : (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M12 2v20M2 12h20"
                  strokeLinecap="round"
                />
              </svg>

              Capture sign
            </>
          )}

        </button>

        {/* Prediction */}
        {prediction !== null && (
          <div className="bg-[#0B1F33] border border-[#1C4368] rounded-xl p-5 mt-4">

            <p className="text-xs uppercase tracking-wide text-[#8FAFC0]">
              Detected sign
            </p>

            <p className="text-3xl font-bold capitalize mt-1">
              {prediction}
            </p>

            {confidence !== null && (
              <div className="mt-3">

                <div className="flex justify-between text-xs text-[#8FAFC0] mb-1">
                  <span>Confidence</span>
                  <span>{(confidence * 100).toFixed(0)}%</span>
                </div>

                <div className="w-full h-1.5 bg-[#132C47] rounded-full overflow-hidden">

                  <div
                    className="h-full bg-[#E8871E] rounded-full transition-all"
                    style={{
                      width: `${confidence * 100}%`
                    }}
                  />

                </div>

              </div>
            )}


            <button
              onClick={() => speakPrediction(prediction)}
              className="mt-4 text-sm text-[#E8871E] hover:text-[#F0A04B] font-medium"
            >
              🔊 Replay audio
            </button>

          </div>
        )}

      </div>

      {/* ================= RIGHT: STAFF → CITIZEN ================= */}
      <div className="bg-[#132C47] border border-[#1C4368] rounded-2xl p-5">

        <div className="text-center mb-4">

          <p className="text-xs uppercase tracking-widest text-[#E8871E] font-semibold">
            Staff → Citizen
          </p>

          <p className="text-sm text-[#8FAFC0] mt-1">
            Text to ISL communication
          </p>

        </div>

        {/* Voice input */}
        <button
          onClick={startListening}
          disabled={isListening}
          className="w-full bg-[#1C4368] hover:bg-[#245079] disabled:bg-[#3E4C58] px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
        >

          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <rect
              x="9"
              y="2"
              width="6"
              height="12"
              rx="3"
            />

            <path
              d="M5 10a7 7 0 0 0 14 0M12 19v3"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />

          </svg>

          {isListening ? "Listening…" : "Speak reply"}

        </button>

        {/* Text input */}
        <input
          type="text"
          value={staffText}
          onChange={(e) => setStaffText(e.target.value)}
          placeholder="Type a response..."
          className="w-full mt-4 px-4 py-3 rounded-lg bg-[#0B1F33] border border-[#1C4368] text-white placeholder-[#8FAFC0] outline-none focus:border-[#E8871E]"
        />

        {/* Staff response */}
        {staffText && (
          <div className="mt-4 bg-[#0B1F33] rounded-lg p-4">

            <p className="text-xs text-[#8FAFC0] mb-1">
              Staff response
            </p>

            <p className="text-xl font-semibold">
              {staffText}
            </p>

          </div>
        )}

        {/* Show in ISL */}
        {staffText && (
          <button
            onClick={showSign}
            className="mt-4 w-full bg-[#E8871E] hover:bg-[#D67A15] px-5 py-3 rounded-lg font-semibold text-[#0B1F33] transition-all"
          >
            Show in ISL
          </button>
        )}

        {/* ISL Video */}
        {signVideos.length > 0 && (
          <div className="mt-5">

            <p className="text-xs uppercase tracking-wide text-[#8FAFC0] mb-2">
              ISL Representation
            </p>

            <video
              key={signVideos[currentSign]}
              src={signVideos[currentSign]}
              autoPlay
              playsInline
              controls
              onEnded={() => {
                if (currentSign < signVideos.length - 1) {
                  setCurrentSign(currentSign + 1);
                }
              }}
              className="w-full rounded-xl border border-[#1C4368] aspect-video object-contain bg-black"
            />

            <p className="text-xs text-[#8FAFC0] mt-2 text-center">
              Sign {currentSign + 1} of {signVideos.length}
            </p>

          </div>
        )}

      </div>

    </div>

    {/* Error message */}
    {errorMessage && (
      <div className="bg-[#3D1F1F] border border-[#6B2E2E] rounded-xl p-4 text-center w-full max-w-6xl">

        <p className="font-semibold">
          Something went wrong
        </p>

        <p className="text-sm text-[#B79C9C] mt-1">
          {errorMessage}
        </p>

      </div>
    )}

  </div>
);
}

export default App;