const GUEST_TOKEN_KEY = "khoj_session_token";

export function getGuestToken(): string {
  if (typeof window === "undefined") return "";

  const existing = localStorage.getItem(GUEST_TOKEN_KEY);
  if (existing) {
    document.cookie = `${GUEST_TOKEN_KEY}=${existing}; path=/; max-age=2592000`;
    return existing;
  }

  const token = crypto.randomUUID();
  localStorage.setItem(GUEST_TOKEN_KEY, token);
  document.cookie = `${GUEST_TOKEN_KEY}=${token}; path=/; max-age=2592000`;
  return token;
}
