export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_BASE = `${API_URL}/api/v1`;
/** Mock is opt-in. Default talks to the FastAPI backend. */
export const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK === "true";

export function delay(ms = 450): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
