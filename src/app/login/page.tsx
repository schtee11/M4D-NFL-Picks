"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrophyIcon } from "@/components/icons";
import { APP_NAME } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [displayName, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Something went wrong.");
        setBusy(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setErr("Network error — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div
        className="app-frame"
        style={{ justifyContent: "center", alignItems: "center", padding: "24px 20px" }}
      >
        <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--radius-sm)",
              background: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-bg)",
            }}
          >
            <TrophyIcon size={19} style={{ strokeWidth: 1.9 }} />
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{APP_NAME}</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>Matchups &amp; playoff bracket</div>
          </div>
        </div>

        <div className="card elev-md" style={{ padding: 18 }}>
          <h4 style={{ margin: "0 0 2px" }}>Join your league</h4>
          <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
            Enter your name and a PIN. New name? You&apos;re in. Coming back? Same
            name + PIN logs you in.
          </p>

          <form onSubmit={submit}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                className="input"
                value={displayName}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jordan"
                autoComplete="username"
                maxLength={24}
              />
            </div>
            <div className="field" style={{ marginBottom: 4 }}>
              <label htmlFor="pin">PIN (4–6 digits)</label>
              <input
                id="pin"
                className="input"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="••••"
                autoComplete="current-password"
                type="password"
              />
            </div>

            {err && (
              <div style={{ color: "#ff8a8a", fontSize: 12.5, marginTop: 10 }}>{err}</div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy}
              style={{ marginTop: 14 }}
            >
              {busy ? "…" : "Enter"}
            </button>
          </form>
        </div>

        <p style={{ opacity: 0.4, fontSize: 11, textAlign: "center", marginTop: 16 }}>
          Keep your PIN handy — it&apos;s how you get back into your picks.
        </p>
        </div>
      </div>
    </div>
  );
}
