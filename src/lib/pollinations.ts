// Pollinations.ai — free, unlimited, no API key required.
// Docs: https://pollinations.ai

export type PollModel =
  | "flux"
  | "flux-realism"
  | "flux-anime"
  | "flux-3d"
  | "turbo"
  | "any-dark";

export const POLL_MODELS: { id: PollModel; label: string; hint: string }[] = [
  { id: "flux", label: "Flux", hint: "Balanced default · photoreal + art" },
  { id: "flux-realism", label: "Flux Realism", hint: "Ultra photoreal, cinematic" },
  { id: "flux-anime", label: "Flux Anime", hint: "Anime / illustration" },
  { id: "flux-3d", label: "Flux 3D", hint: "Stylized 3D render look" },
  { id: "turbo", label: "Turbo", hint: "Fastest, lower fidelity" },
  { id: "any-dark", label: "Any Dark", hint: "Dark aesthetic, moody" },
];

export const POLL_RATIOS = [
  { id: "1:1", label: "Square 1:1", w: 1024, h: 1024 },
  { id: "16:9", label: "Widescreen 16:9", w: 1280, h: 720 },
  { id: "9:16", label: "Portrait 9:16", w: 720, h: 1280 },
  { id: "4:3", label: "Standard 4:3", w: 1152, h: 864 },
  { id: "3:2", label: "Photo 3:2", w: 1200, h: 800 },
] as const;

export type PollRatio = (typeof POLL_RATIOS)[number]["id"];

export interface BuildOpts {
  prompt: string;
  model?: PollModel;
  width?: number;
  height?: number;
  seed?: number;
  enhance?: boolean;
  nologo?: boolean;
}

export function buildPollUrl({
  prompt,
  model = "flux",
  width = 1024,
  height = 1024,
  seed,
  enhance = true,
  nologo = true,
}: BuildOpts): string {
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model,
    nologo: nologo ? "true" : "false",
    enhance: enhance ? "true" : "false",
  });
  if (typeof seed === "number") params.set("seed", String(seed));
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
