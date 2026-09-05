"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Client-side error boundary around the live game UI.
 * Catches runtime render errors inside the app and shows the REAL error
 * message + stack + user agent instead of Next's generic "Application error"
 * boundary. This is a diagnostic tool to pin down mobile-only crashes.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // Log to console so it also shows in the devtools / remote debugging
    console.error("[ErrorBoundary] Caught:", error, info?.componentStack ?? "");
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div style={{
          maxWidth: 720,
          margin: "40px auto",
          padding: 24,
          background: "#111827",
          color: "#f3f4f6",
          fontFamily: "system-ui, sans-serif",
        }}>
          <h2 style={{ color: "#ef4444", marginTop: 0 }}>
            ⚠️ Something went wrong
          </h2>
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
{`CLIENT ERROR

Message:
${err?.message ?? "No message"}

Stack:
${err?.stack ?? "No stack trace captured"}

User Agent:
${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}
`}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
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
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
