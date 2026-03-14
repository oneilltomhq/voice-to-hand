// app/test-deepgram/page.tsx or any component
"use client";

import { useEffect, useRef, useState } from "react";
import type { UtteranceEndEvent } from "@deepgram/sdk";
import { getDeepgramOptions } from "../../lib/deepgram-config";
import {
  useDeepgram,
  LiveConnectionState,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
} from "@/app/context/DeepgramContextProvider";
import {
  useMicrophone,
  MicrophoneEvents,
  MicrophoneState,
} from "@/app/context/MicrophoneContextProvider";

const ENDPOINTING_MS = 500;
const UTTERANCE_END_MS = 1200;

export default function TestDeepgram() {
  const [text, setText] = useState<string>("");
  const [status, setStatus] = useState<string>("idle");
  const [endpointeds, setEndpointeds] = useState<string[]>([]);
  const [utterances, setUtterances] = useState<string[][]>([]);
  const [currentUtterancePreview, setCurrentUtterancePreview] = useState<
    string[]
  >([]);
  const [lastUtteranceEnd, setLastUtteranceEnd] =
    useState<UtteranceEndEvent | null>(null);

  const { connection, connectToDeepgram, connectionState } = useDeepgram();
  const { setupMicrophone, microphone, startMicrophone, microphoneState } =
    useMicrophone();

  const startedRef = useRef(false);
  const currentUtteranceRef = useRef<string[]>([]);
  const lastEndpointedChunkRef = useRef<string | null>(null);

  // Start the flow when the user clicks the button
  const handleStart = async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    setText("");
    setEndpointeds([]);
    setUtterances([]);
    setCurrentUtterancePreview([]);
    currentUtteranceRef.current = [];
    lastEndpointedChunkRef.current = null;
    setLastUtteranceEnd(null);

    setStatus("requesting mic...");
    await setupMicrophone(); // asks for permission

    setStatus("connecting to Deepgram...");
    await connectToDeepgram(getDeepgramOptions({
      endpointing: ENDPOINTING_MS,
      utterance_end_ms: UTTERANCE_END_MS,
    }));
  };

  // When connection is OPEN, start mic and wire up events
  useEffect(() => {
    if (!microphone || !connection) return;
    if (connectionState !== LiveConnectionState.OPEN) return;

    setStatus("streaming audio...");

    const onData = (e: BlobEvent) => {
      if (e.data.size > 0) {
        connection.send(e.data);
      }
    };

    const onTranscript = (data: LiveTranscriptionEvent) => {
      const transcript = data.channel.alternatives[0]?.transcript ?? "";
      if (transcript) {
        setText(transcript);
      }
      const hasEndpointSignal =
        (typeof data.speech_final === "boolean" && data.speech_final) ||
        (typeof data.is_final === "boolean" && data.is_final);

      if (!hasEndpointSignal) {
        return;
      }

      const finalLine = transcript.trim();
      if (finalLine.length === 0) {
        return;
      }

      const chunkKey = `${data.start}-${data.duration}-${finalLine}`;
      if (chunkKey === lastEndpointedChunkRef.current) {
        return;
      }

      lastEndpointedChunkRef.current = chunkKey;

      setEndpointeds((prev) => [...prev, finalLine]);
      const nextUtterance = [...currentUtteranceRef.current, finalLine];
      currentUtteranceRef.current = nextUtterance;
      setCurrentUtterancePreview(nextUtterance);
    };

    const onUtteranceEnd = (event: UtteranceEndEvent) => {
      setLastUtteranceEnd(event);
      const completed = [...currentUtteranceRef.current];
      if (completed.length === 0) {
        return;
      }

      setUtterances((prev) => [...prev, completed]);
      currentUtteranceRef.current = [];
      lastEndpointedChunkRef.current = null;
      setCurrentUtterancePreview([]);
    };

    microphone.addEventListener(MicrophoneEvents.DataAvailable, onData);
    connection.addListener(LiveTranscriptionEvents.Transcript, onTranscript);
    connection.addListener(
      LiveTranscriptionEvents.UtteranceEnd,
      onUtteranceEnd
    );

    startMicrophone();

    return () => {
      microphone.removeEventListener(MicrophoneEvents.DataAvailable, onData);
      connection.removeListener(
        LiveTranscriptionEvents.Transcript,
        onTranscript
      );
      connection.removeListener(
        LiveTranscriptionEvents.UtteranceEnd,
        onUtteranceEnd
      );
    };
  }, [microphone, connection, connectionState, startMicrophone]);

  return (
    <div style={{ padding: 24 }}>
      <button onClick={handleStart}>Start Deepgram Test</button>
      <div style={{ marginTop: 12 }}>
        <strong>Status:</strong> {status} ( mic:{" "}
        {MicrophoneState[microphoneState ?? MicrophoneState.NotSetup]}, conn:{" "}
        {LiveConnectionState[connectionState]})
      </div>
      <div style={{ marginTop: 24 }}>
        <strong>Transcript:</strong>
        <p>{text || "(start speaking…)"} </p>
      </div>
      <div style={{ marginTop: 24 }}>
        <strong>Endpointed lines ({endpointeds.length}):</strong>
        {endpointeds.length === 0 ? (
          <p>(waiting for endpointed speech)</p>
        ) : (
          <ol>
            {endpointeds.map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
          </ol>
        )}
      </div>
      <div style={{ marginTop: 24 }}>
        <strong>Current utterance (pending end):</strong>
        {currentUtterancePreview.length === 0 ? (
          <p>(none)</p>
        ) : (
          <ul>
            {currentUtterancePreview.map((line, idx) => (
              <li key={`preview-${line}-${idx}`}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ marginTop: 24 }}>
        <strong>Utterances ({utterances.length}):</strong>
        {utterances.length === 0 ? (
          <p>(waiting for utterance boundaries)</p>
        ) : (
          <ol>
            {utterances.map((utterance, idx) => (
              <li key={`utterance-${idx}`}>[{utterance.join(" | ")}]</li>
            ))}
          </ol>
        )}
      </div>
      <div style={{ marginTop: 24 }}>
        <strong>Last UtteranceEnd payload:</strong>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {lastUtteranceEnd
            ? JSON.stringify(lastUtteranceEnd, null, 2)
            : "(none yet)"}
        </pre>
      </div>
    </div>
  );
}
