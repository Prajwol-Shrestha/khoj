const GUEST_TOKEN_KEY = "khoj_guest_token";

function randomToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `guest-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getGuestToken(): string {
  if (typeof window === "undefined") return "";

  let token = window.localStorage.getItem(GUEST_TOKEN_KEY);
  if (!token) {
    token = randomToken();
    window.localStorage.setItem(GUEST_TOKEN_KEY, token);
  }
  return token;
}
