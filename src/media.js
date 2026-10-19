// Standalone builds resolve every game asset to an embedded data URL. Hosted
// builds use the same prepared files beside the application, with no backend.
export function mediaURL(name) {
  return globalThis.__BIOHAZARD_MEDIA__?.[name] || `${import.meta.env.BASE_URL}local-game-assets/${name}`;
}

export async function mediaJSON(name) {
  const response = await fetch(mediaURL(name));
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error(`Game data is unavailable: ${name}`);
  return response.json();
}
