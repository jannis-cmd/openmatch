"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  visibilityLabel?: string;
  showLabel?: string;
  hideLabel?: string;
};

export function PasswordInput({
  visibilityLabel = "password",
  showLabel = "Show",
  hideLabel = "Hide",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const action = visible ? hideLabel : showLabel;

  return (
    <span className="password-input-wrap">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-visibility"
        aria-label={`${action} ${visibilityLabel}`}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.8 5.2A10.6 10.6 0 0112 5c5.4 0 8.5 5.3 8.5 5.3a11.9 11.9 0 01-2.6 3.2M6.1 6.2a13.1 13.1 0 00-2.6 4.1S6.6 15.7 12 15.7c.8 0 1.6-.1 2.3-.3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.5 12S6.6 6.7 12 6.7 20.5 12 20.5 12 17.4 17.3 12 17.3 3.5 12 3.5 12z" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
        )}
      </button>
    </span>
  );
}
