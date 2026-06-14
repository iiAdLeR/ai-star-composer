import type { PlanetName, StyleId } from "@/lib/api";

export type PlanetFact = {
  blurb: string;
  bestStyles: StyleId[];
};

export const PLANET_FACTS: Record<PlanetName, PlanetFact> = {
  Mercury: {
    blurb: "Smallest and fastest around the Sun; sharp day-night contrast.",
    bestStyles: ["study", "cinematic"],
  },
  Venus: {
    blurb: "Dense cloud cover and slow spin; warm and heavy atmosphere.",
    bestStyles: ["calm", "cinematic"],
  },
  Earth: {
    blurb: "Balanced orbital profile with familiar rhythmic motion.",
    bestStyles: ["calm", "pop"],
  },
  Mars: {
    blurb: "Dry and dusty world with steady, concise orbital pacing.",
    bestStyles: ["study", "pop"],
  },
  Jupiter: {
    blurb: "Gas giant with huge storms and high-energy rotational character.",
    bestStyles: ["cinematic", "pop"],
  },
  Saturn: {
    blurb: "Iconic rings and elegant movement patterns.",
    bestStyles: ["calm", "cinematic"],
  },
  Uranus: {
    blurb: "Extreme tilt and cool tones; unusual seasonal behavior.",
    bestStyles: ["study", "calm"],
  },
  Neptune: {
    blurb: "Distant, windy giant with deep blue atmosphere.",
    bestStyles: ["cinematic", "calm"],
  },
};
