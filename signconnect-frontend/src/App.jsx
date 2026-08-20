import { useRef, useState, useEffect } from "react";

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [prediction, setPrediction] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("ready");
  const [errorMessage, setErrorMessage] = useState(null);

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
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 100)
        );
      }

      if (predictions.length === 0) {
        setPrediction(null);
        setConfidence(null);
        setErrorMessage("No hand detected");
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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">
        SignConnect
      </h1>

      <div className="relative w-full max-w-2xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full aspect-video object-cover rounded-2xl border-2 border-gray-700"
        />

        <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-sm">
          <span className="text-green-400">●</span>{" "}
          Camera Ready
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-2 rounded-lg text-sm">
          Place your hand clearly inside the frame
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="hidden"
      />

      <button
        onClick={captureAndPredict}
        disabled={loading}
        className="w-full max-w-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-4 rounded-xl font-semibold text-lg transition-all duration-150 shadow-lg"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-3">
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            Detecting Sign...
          </span>
        ) : (
          "Capture Sign"
        )}
      </button>

      {prediction !== null && (
        <div className="bg-gray-800 rounded-xl p-6 text-center w-full max-w-md animate-in fade-in duration-300">
          <p className="text-sm text-gray-400">
            Detected Sign
          </p>

          <p className="text-4xl font-bold capitalize">
            {prediction}
          </p>

          {confidence !== null && (
            <p className="text-sm text-gray-400 mt-2">
              Confidence: {(confidence * 100).toFixed(0)}%
            </p>
          )}

          <button
            onClick={() => speakPrediction(prediction)}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300 underline"
          >
            🔊 Replay
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-900/40 border border-red-700 rounded-xl p-6 text-center w-full max-w-md">
          <p className="text-lg font-semibold">
            {status === "error"
              ? "Something went wrong"
              : "No hand detected"}
          </p>

          <p className="text-sm text-gray-400 mt-1">
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;