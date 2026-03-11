"use client";

import { getDeepgramOptions } from "../../lib/deepgram-config";
import {
  LiveConnectionState,
  LiveTranscriptionEvents,
  useDeepgram,
  type LiveTranscriptionEvent,
} from "@/app/context/DeepgramContextProvider";
import {
  MicrophoneEvents,
  useMicrophone,
} from "@/app/context/MicrophoneContextProvider";
import { useVoiceHandHistory } from "@/app/hooks/useVoiceHandHistory";
import { useEffect, useRef, useState } from "react";

const ENDPOINTING_MS = 500;

export default function TestDeepgramGroqIntegration() {
  // --- Groq / Game State ---
  const { history, patchHistory, transcript, resetState, processCommand } =
    useVoiceHandHistory();

  // --- Deepgram / Audio State ---
  const [status, setStatus] = useState<string>("idle");
  const [transcriptText, setTranscriptText] = useState<string>("");

  const { connection, connectToDeepgram, connectionState } = useDeepgram();
  const { setupMicrophone, microphone, startMicrophone, microphoneState } =
    useMicrophone();

  const startedRef = useRef(false);
  const lastEndpointedChunkRef = useRef<string | null>(null);

  // --- Deepgram Setup ---

  const handleStart = async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    setTranscriptText("");
    setStatus("requesting mic...");
    await setupMicrophone();

    setStatus("connecting to Deepgram...");
    await connectToDeepgram(getDeepgramOptions({
      endpointing: ENDPOINTING_MS,
    }));
  };

  // Event Listeners
  useEffect(() => {
    if (!microphone || !connection) return;
    if (connectionState !== LiveConnectionState.OPEN) return;

    setStatus("streaming audio...");

    const onData = (e: BlobEvent) => {
      if (e.data.size > 0) connection.send(e.data);
    };

    const onTranscript = (data: LiveTranscriptionEvent) => {
      const transcript = data.channel.alternatives[0]?.transcript ?? "";
      if (transcript) {
        setTranscriptText(transcript);
      }

      const hasEndpointSignal =
        (typeof data.speech_final === "boolean" && data.speech_final) ||
        (typeof data.is_final === "boolean" && data.is_final);

      if (!hasEndpointSignal) return;

      const finalLine = transcript.trim();
      if (finalLine.length === 0) return;

      const chunkKey = `${data.start}-${data.duration}-${finalLine}`;
      if (chunkKey === lastEndpointedChunkRef.current) return;

      lastEndpointedChunkRef.current = chunkKey;

      // Add to processing queue
      console.log("Endpoint detected, queuing:", finalLine);
      processCommand(finalLine);
    };

    microphone.addEventListener(MicrophoneEvents.DataAvailable, onData);
    connection.addListener(LiveTranscriptionEvents.Transcript, onTranscript);

    startMicrophone();

    return () => {
      microphone.removeEventListener(MicrophoneEvents.DataAvailable, onData);
      connection.removeListener(
        LiveTranscriptionEvents.Transcript,
        onTranscript
      );
    };
  }, [
    microphone,
    connection,
    connectionState,
    startMicrophone,
    processCommand,
  ]);

  const copyToClipboard = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-6">
        Deepgram Voice → Groq JSON Patch
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Voice Control & Status */}
        <div className="space-y-6">
          <div className="p-6 bg-white border rounded-lg shadow-sm">
            <button
              onClick={handleStart}
              disabled={connectionState === LiveConnectionState.OPEN}
              className={`px-6 py-3 rounded-lg font-medium text-white transition-colors ${
                connectionState === LiveConnectionState.OPEN
                  ? "bg-green-600 cursor-default"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {connectionState === LiveConnectionState.OPEN
                ? "Listening..."
                : "Start Microphone"}
            </button>

            <div className="mt-4 text-sm text-gray-600">
              <p>
                Status: <span className="font-semibold">{status}</span>
              </p>
            </div>
          </div>

          {/* Transcript Debug */}
          <div className="p-4 bg-slate-50 border rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-gray-500 uppercase">
                Transcript Array (Debug)
              </h3>
              <button
                onClick={() => copyToClipboard(transcript)}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Copy
              </button>
            </div>
            <pre className="text-xs overflow-auto max-h-40 bg-white p-2 border text-gray-900 font-mono">
              {JSON.stringify(transcript, null, 2)}
            </pre>
          </div>

          {/* Live Transcript */}
          <div className="p-4 bg-slate-50 border rounded-lg">
            <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">
              Live Transcript
            </h3>
            <p className="text-lg text-slate-800 min-h-12">
              {transcriptText || (
                <span className="text-gray-400 italic">(speak now...)</span>
              )}
            </p>
          </div>

          {/* Patch History */}
          <div className="p-4 bg-gray-100 rounded">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-sm text-gray-700">Patch History</h3>
              <div className="flex gap-3">
                <button
                  onClick={() => copyToClipboard(patchHistory)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Copy
                </button>
                <button
                  onClick={resetState}
                  className="text-xs text-red-600 underline"
                >
                  Reset State
                </button>
              </div>
            </div>
            {patchHistory.length > 0 ? (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {patchHistory.map((patch, idx) => (
                  <div
                    key={idx}
                    className="bg-white border rounded-lg p-3 text-xs shadow-sm"
                  >
                    <div className="border-b pb-2 mb-2 text-gray-500">
                      <div className="flex justify-between">
                        <span className="font-bold text-gray-700">
                          "{patch.command}"
                        </span>
                        <span>{patch.timestamp}</span>
                      </div>
                      {patch.error && (
                        <div className="mt-1 text-red-600 font-bold bg-red-50 p-1 rounded">
                          Error: {JSON.stringify(patch.error)}
                        </div>
                      )}
                    </div>
                    <pre className="overflow-auto max-h-32 text-gray-600">
                      {JSON.stringify(patch.patches, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic">
                (No patches applied yet)
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Game State */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-sm text-gray-700">
              Current Game State (OpenHandHistory)
            </h3>
            <button
              onClick={() => copyToClipboard(history)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Copy
            </button>
          </div>
          <div className="bg-slate-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto h-[600px] shadow-inner">
            <pre>{JSON.stringify(history, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
