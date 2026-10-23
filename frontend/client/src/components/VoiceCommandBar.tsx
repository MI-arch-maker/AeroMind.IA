import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, AlertTriangle, CheckCircle2, Volume2, Send } from "lucide-react";

// ===========================================================================
// VoiceCommandBar — Web Speech API integration (v13)
//
// Uses the browser's Web Speech API (SpeechRecognition) to capture voice
// commands in French or English, sends to /api/voice/parse for NLP, shows a
// preview, then optionally executes via /api/voice/execute (gated by token).
//
// Browser support: Chrome, Edge, Safari (webkit prefix). Firefox doesn't
// support SpeechRecognition natively — falls back to text input.
// ===========================================================================

type ParsedCommand = {
  command: string;
  parameters: Record<string, number>;
  preview: string;
  raw: string;
  droneId: string;
  isEstop: boolean;
};

type Props = {
  projectId: string | null;
};

export function VoiceCommandBar({ projectId }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<string | null>(null);
  const [droneId, setDroneId] = useState("");
  const [confirmationToken, setConfirmationToken] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Check Web Speech API support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "fr-FR"; // default French

    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      setTranscript(final + interim);
      if (final) {
        setListening(false);
        void parseCommand(final);
      }
    };

    recognition.onerror = (event: any) => {
      setError(`Erreur reconnaissance: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = () => {
    if (!recognitionRef.current) return;
    setError(null);
    setTranscript("");
    setParsed(null);
    setParseError(null);
    setExecResult(null);
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e: any) {
      setError(`Démarrage impossible: ${e?.message}`);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  };

  const parseCommand = async (text: string) => {
    setError(null);
    setParseError(null);
    setParsed(null);
    try {
      const r = await fetch("/api/voice/parse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, droneId }),
      });
      const body = await r.json();
      if (r.ok) {
        setParsed(body);
      } else {
        setParseError(body?.error?.message ?? "Commande non reconnue");
      }
    } catch (e: any) {
      setParseError(`Réseau: ${e?.message}`);
    }
  };

  const executeCommand = async () => {
    if (!parsed) return;
    setExecuting(true);
    setExecResult(null);
    try {
      const r = await fetch("/api/voice/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: parsed.command,
          parameters: parsed.parameters,
          droneId,
          confirmationToken,
          projectId,
          isEstop: parsed.isEstop,
        }),
      });
      const body = await r.json();
      if (r.ok) {
        if (body.sentToHardware) {
          setExecResult(`✓ Commande ${parsed.command} envoyée — reçuId ${body.receiptId}`);
        } else if (body.stopped) {
          setExecResult(`✓ E-stop déclenché — ${body.results?.length ?? 0} drone(s) notifiés`);
        } else {
          setExecResult(`Commande refusée: ${body.reason ?? body.error?.message ?? "inconnue"}`);
        }
      } else {
        setExecResult(`Échec: ${body?.error?.message ?? `HTTP ${r.status}`}`);
      }
    } catch (e: any) {
      setExecResult(`Réseau: ${e?.message}`);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="lb-voice">
      <div className="lb-voice-toolbar">
        <span className="lb-radar-title">
          <Volume2 size={14} /> Commandes vocales (v13)
        </span>
        {!supported ? (
          <span className="lb-text-warning">Web Speech API non supportée — saisie texte uniquement</span>
        ) : (
          <button
            className={listening ? "lb-estop" : "lb-primary"}
            onClick={listening ? stopListening : startListening}
            title={listening ? "Arrêter l'écoute" : "Démarrer l'écoute"}
          >
            {listening ? <><MicOff size={14} /> Stop</> : <><Mic size={14} /> Parler</>}
          </button>
        )}
      </div>

      {/* Live transcript */}
      <div className="lb-voice-transcript">
        {listening && <span className="lb-voice-pulse">●</span>}
        <textarea
          ref={textInputRef}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Parlez ou tapez une commande… (ex: « décolle à 5 mètres »)"
          rows={2}
        />
        {transcript && !parsed && (
          <button className="lb-secondary" onClick={() => parseCommand(transcript)}>
            <Send size={13} /> Parser
          </button>
        )}
      </div>

      {error && (
        <div className="lb-voice-error">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {parseError && (
        <div className="lb-voice-error">
          <AlertTriangle size={14} /> {parseError}
        </div>
      )}

      {/* Parsed command preview */}
      {parsed && (
        <div className="lb-voice-parsed">
          <CheckCircle2 size={16} />
          <div>
            <strong>{parsed.preview}</strong>
            <small>Commande: {parsed.command} · Params: {JSON.stringify(parsed.parameters)}</small>
          </div>
        </div>
      )}

      {/* Execution form */}
      {parsed && !parsed.isEstop && (
        <div className="lb-voice-exec-form">
          <label>
            <span>Drone ID cible</span>
            <input type="text" value={droneId} onChange={(e) => setDroneId(e.target.value)} placeholder="UUID du drone" />
          </label>
          <label>
            <span>Token single-use</span>
            <input type="text" value={confirmationToken} onChange={(e) => setConfirmationToken(e.target.value)} placeholder="64-char token" />
          </label>
          <button
            className="lb-primary"
            onClick={executeCommand}
            disabled={executing || !droneId || confirmationToken.length < 16}
          >
            {executing ? "Envoi…" : "Exécuter la commande vocale"}
          </button>
        </div>
      )}

      {/* E-stop doesn't need token */}
      {parsed?.isEstop && (
        <div className="lb-voice-exec-form">
          <button className="lb-estop" onClick={executeCommand} disabled={executing}>
            {executing ? "Envoi…" : "⚠️ CONFIRMER E-STOP VOCAL"}
          </button>
        </div>
      )}

      {execResult && (
        <div className={`lb-voice-result ${execResult.startsWith("✓") ? "is-success" : "is-fail"}`}>
          {execResult}
        </div>
      )}

      {/* Examples */}
      <details className="lb-voice-help">
        <summary>Exemples de commandes vocales</summary>
        <ul>
          <li><code>décolle à 5 mètres</code> → NAV_TAKEOFF p7=5</li>
          <li><code>take off to 10 meters</code> → NAV_TAKEOFF p7=10</li>
          <li><code>atterris</code> / <code>land</code> → NAV_LAND</li>
          <li><code>reviens à la base</code> / <code>return to launch</code> → RTL</li>
          <li><code>arme le drone</code> / <code>arm</code> → COMPONENT_ARM_DISARM p1=1</li>
          <li><code>désarme</code> / <code>disarm</code> → COMPONENT_ARM_DISARM p1=0</li>
          <li><code>arrêt d'urgence</code> / <code>emergency stop</code> → E-STOP broadcast</li>
        </ul>
      </details>
    </div>
  );
}
