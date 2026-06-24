"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const CONSENT_KEY = "gold-miner-consent-v1";

export function ConsentModal() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const consented = typeof window !== "undefined" && localStorage.getItem(CONSENT_KEY) === "agreed";
    if (!consented) setOpen(true);
  }, []);

  const handleAgree = () => {
    if (!checked) return;
    localStorage.setItem(CONSENT_KEY, "agreed");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl p-6 space-y-5">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-white">Before You Play</h2>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-yellow-300 text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Photosensitive Epilepsy Warning
          </h3>
          <p className="text-xs text-yellow-200/80 leading-relaxed">
            A small percentage of people may experience seizures or discomfort when exposed to flashing lights,
            rapidly changing visual patterns, or intense screen effects. If you or anyone in your household has
            an epileptic condition, please consult a physician before playing. Stop immediately if you experience
            dizziness, altered vision, eye or muscle twitches, loss of awareness, or disorientation.
          </p>
        </div>

        <div className="text-sm text-gray-300 space-y-3">
          <p>
            By clicking "I Agree," you confirm that you have read and agree to our{" "}
            <Link href="/terms" className="text-yellow-400 hover:text-yellow-300 underline" target="_blank">
              Terms and Conditions
            </Link>
            , and that you understand the photosensitive epilepsy warning above.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="peer sr-only"
            />
            <div className="w-5 h-5 rounded border border-gray-500 bg-gray-700 peer-checked:bg-yellow-500 peer-checked:border-yellow-500 transition-colors flex items-center justify-center">
              {checked && (
                <svg className="w-3.5 h-3.5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
            I have read and agree to the{" "}
            <Link href="/terms" className="text-yellow-400 hover:text-yellow-300 underline" target="_blank">
              Terms and Conditions
            </Link>
            {" "}and the photosensitive epilepsy warning.
          </span>
        </label>

        <button
          onClick={handleAgree}
          disabled={!checked}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
            checked
              ? "bg-yellow-500 hover:bg-yellow-400 text-gray-900 shadow-lg shadow-yellow-500/20 cursor-pointer"
              : "bg-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          I Agree
        </button>
      </div>
    </div>
  );
}
