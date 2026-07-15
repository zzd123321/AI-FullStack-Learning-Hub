function readCsrfToken(): string {
  const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
  if (!token) throw new Error("Missing CSRF token");
  return token;
}

export async function updateProfile(displayName: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch("/api/profile", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": readCsrfToken(),
    },
    body: JSON.stringify({ displayName }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Profile update failed: HTTP ${response.status}`);
}
