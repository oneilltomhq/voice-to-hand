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
import { useEffect, useRef, useState } from "react";
import { useVoiceHandHistory } from "@/app/hooks/useVoiceHandHistory";
import { HandReplayer } from "@/app/components/HandReplayer";
import { MOCK_TRANSCRIPTS } from "@/app/lib/mock-transcripts";

const ENDPOINTING_MS = 500;

export default function VoiceDrivenReplayerPage() {
  // --- Groq / Game State ---
  const { history, patchHistory, transcript, resetState, processCommand } =
    useVoiceHandHistory();

  // --- Deepgram / Audio State ---
  const [status, setStatus] = useState<string>("idle");
  const [transcriptText, setTranscriptText] = useState<string>("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<keyof typeof MOCK_TRANSCRIPTS>("standard");

  const { connection, connectToDeepgram, connectionState } = useDeepgram();
  const { setupMicrophone, microphone, startMicrophone } = useMicrophone();

  const startedRef = useRef(false);
  const lastEndpointedChunkRef = useRef<string | null>(null);

  // --- Simulation ---
  const runSimulation = async () => {
    if (isSimulating) return;

    resetState();
    setIsSimulating(true);
    setStatus(`simulating ${MOCK_TRANSCRIPTS[selectedScenario].label}...`);

    const lines = MOCK_TRANSCRIPTS[selectedScenario].lines;

    for (const line of lines) {
      setTranscriptText(line);
      processCommand(line);
      // Wait 2.5s to simulate speaking time/pauses
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    setIsSimulating(false);
    setStatus("simulation complete");
    setTranscriptText("");
  };

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

      // Add to processing queue via hook
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

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2 uppercase font-semibold">
                Dev Tools
              </p>
              
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Scenario</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value as any)}
                  disabled={isSimulating}
                  className="w-full px-3 py-2 text-sm border rounded bg-gray-50 text-gray-700"
                >
                  {Object.entries(MOCK_TRANSCRIPTS).map(([key, { label }]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={runSimulation}
                disabled={
                  isSimulating || connectionState === LiveConnectionState.OPEN
                }
                className={`w-full px-4 py-2 rounded text-sm font-medium transition-colors ${
                  isSimulating
                    ? "bg-purple-100 text-purple-700 cursor-wait"
                    : "bg-white border-2 border-purple-600 text-purple-700 hover:bg-purple-50"
                }`}
              >
                {isSimulating ? "▶ Simulating..." : "▶ Run Mock Scenario"}
              </button>
            </div>

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
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-gray-700">Live Replayer</h3>
            <div className="flex gap-2 items-center text-xs text-gray-500">
              <span>Table Size: {history.table_size}</span>
              <span>•</span>
              <span>Dealer Seat: {history.dealer_seat}</span>
              <span>•</span>
              <button
                onClick={() => copyToClipboard(history)}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Copy JSON
              </button>
            </div>
          </div>

          {/* The Visual Replayer */}
          <HandReplayer 
            history={history} 
            latestPatch={patchHistory[0]} 
          />

          {/* Collapsible Raw JSON for debugging */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 mb-2">
              Show Raw History JSON
            </summary>
            <div className="bg-slate-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-[400px] shadow-inner">
              <pre>{JSON.stringify(history, null, 2)}</pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
