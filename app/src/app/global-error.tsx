"use client";

// Next.js root error boundary. Replaces the generic "Application error: a
// client-side exception has occurred" screen with the real error message +
// stack so we can diagnose mobile/desktop crashes from the browser itself.
// Must include its own <html>/<body> as it replaces the whole tree.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#111827", color: "#f3f4f6", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 720, margin: "40px auto", padding: "24px" }}>
          <pre style={{
            background: "#1f2937",
            border: "1px solid #ef4444",
            borderRadius: 12,
            padding: 20,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 13,
            lineHeight: 1.5,
            overflow: "auto",
            maxHeight: "70vh",
          }}>
{`GLOBAL ERROR

Message:
${error?.message ?? "No message"}

${error?.digest ? `Digest: ${error.digest}\n` : ""}

Stack:
${error?.stack ?? "No stack trace captured"}

User Agent:
${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}
`}
          </pre>
          <div style={{ marginTop: 16 }}>
            <button
              onClick={reset}
              style={{
                background: "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
