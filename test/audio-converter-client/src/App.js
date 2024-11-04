import React, { useState, useEffect, useRef } from "react";
import "./AudioUploader.css"; // Import the CSS file for styles

function AudioUploader() {
  const [uploading, setUploading] = useState(false);
  const [audioContext, setAudioContext] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioDetails, setAudioDetails] = useState(null); // New state for audio details
  const audioQueue = useRef([]);
  const isPlayingRef = useRef(false);
  const intervalRef = useRef(null);
  const currentSourceRef = useRef(null);
  const totalDurationRef = useRef(0); // Track total audio duration
  const playedDurationRef = useRef(0); // Track played audio duration

  useEffect(() => {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    setAudioContext(context);
  }, []);

  const handleAudioUpload = (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== "audio/wav") {
      alert("Please upload a valid WAV file.");
      return;
    }

    // Set audio details
    const details = {
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2), // Size in MB
      type: file.type,
      extension: file.name.split(".").pop(),
    };

    setAudioDetails(details); // Update audio details
    setUploading(true);
    setIsFinished(false);
    setProgress(0);
    audioQueue.current = []; // Reset audio queue
    totalDurationRef.current = 0; // Reset total duration
    playedDurationRef.current = 0; // Reset played duration

    const ws = new WebSocket("ws://localhost:8080/stream");
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        const chunkSize = 512 * 1024; // 512 KB chunks
        let offset = 0;

        while (offset < arrayBuffer.byteLength) {
          const chunk = arrayBuffer.slice(offset, offset + chunkSize);
          ws.send(chunk);
          offset += chunkSize;
        }

        ws.send("EOF");
      };
      reader.readAsArrayBuffer(file);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        playAudio(event.data);
      }
    };

    ws.onclose = () => {
      setUploading(false);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setUploading(false);
    };
  };

  const playAudio = (audioData) => {
    if (!audioContext) return;

    audioContext
      .decodeAudioData(audioData)
      .then((buffer) => {
        audioQueue.current.push(buffer);
        totalDurationRef.current += buffer.duration; // Add to total duration
        if (!isPlayingRef.current) {
          playNextAudio();
        }
      })
      .catch((error) => {
        console.error("Error decoding audio data:", error);
      });
  };

  const playNextAudio = () => {
    if (audioQueue.current.length === 0) {
      setIsPlaying(false);
      setIsFinished(true);
      clearInterval(intervalRef.current);
      setProgress(100);
      return;
    }

    const nextBuffer = audioQueue.current.shift();
    const sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = nextBuffer;
    sourceNode.connect(audioContext.destination);
    sourceNode.start(0);
    isPlayingRef.current = true;

    // Track playback
    const duration = nextBuffer.duration;
    playedDurationRef.current += duration;

    // Update the progress bar every 100ms
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const percent = Math.min(
        (playedDurationRef.current / totalDurationRef.current) * 100,
        100
      );
      setProgress(percent);
    }, 100); // Update progress every 100ms

    sourceNode.onended = () => {
      clearInterval(intervalRef.current);
      isPlayingRef.current = false;
      playNextAudio();
    };
  };

  return (
    <div className="audio-uploader">
      <div className="header">
        <h1>Audio Uploader</h1>
        <input
          type="file"
          accept="audio/wav"
          onChange={handleAudioUpload}
          className="file-input"
        />
      </div>
      {uploading && <p className="status">Uploading and converting audio...</p>}
      {isPlaying && <p className="status">Playing audio in real-time...</p>}
      {isFinished && <p className="status finished">Finished playing audio.</p>}

      {/* Display audio details */}
      {audioDetails && (
        <div className="audio-details">
          <h2>Audio Details:</h2>
          <p>
            <strong>File Name:</strong> {audioDetails.name}
          </p>
          <p>
            <strong>File Size:</strong> {audioDetails.size} MB
          </p>
          <p>
            <strong>File Type:</strong> {audioDetails.type}
          </p>
          <p>
            <strong>File Extension:</strong> {audioDetails.extension}
          </p>
        </div>
      )}

      <div className="progress-container">
        <progress
          value={progress}
          max="100"
          className="progress-bar"
        ></progress>
        <p className="progress-text">{progress.toFixed(2)}%</p>
      </div>
    </div>
  );
}

export default AudioUploader;
