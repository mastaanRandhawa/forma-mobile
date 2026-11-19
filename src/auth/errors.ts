import { ApiRequestError } from "@/api/client";

const BY_CODE: Record<string, string> = {
  invalid_credentials: "That email and password don't match.",
  account_inactive: "This account is no longer active.",
  email_not_verified: "Verify your email address to continue.",
  session_expired: "Your session expired. Sign in again.",
  too_many_requests: "Too many attempts. Wait a few minutes and try again.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  token_invalid: "This link is invalid. Request a new one.",
  token_expired: "This link has expired. Request a new one.",
  reset_link_expired: "This reset link has expired. Request a new one.",
  no_password: "This account uses Google or Apple sign-in. Use “forgot password” to set a password.",
  last_credential: "Set a password before unlinking your only sign-in method.",
  conflict: "An account with that email already exists.",
};

/** Same wording as the website's mapAuthError. */
export function mapAuthError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "account_locked") return error.message || "Too many attempts. Try again later or reset your password.";
    if (BY_CODE[error.code]) return BY_CODE[error.code];
    if (error.status === 429) return BY_CODE.too_many_requests;
    return error.message || "Something went wrong.";
  }
  if (error instanceof Error && /network request failed|failed to fetch/i.test(error.message)) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Accept a raw token or any pasted URL containing ?token=… (reset / verify links). */
export const extractToken = (s: string) => {
  const m = s.match(/[?&]token=([^&\s]+)/);
  return decodeURIComponent((m ? m[1] : s).trim());
};
