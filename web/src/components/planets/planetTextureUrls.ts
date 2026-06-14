import type { PlanetName } from "@/lib/api";

const WM = "https://upload.wikimedia.org/wikipedia/commons";

/**
 * Albedo / color maps (mostly NASA / Wikimedia Commons). Neptune uses Moon albedo + blue tint in material.
 * Attribution: see project docs / thesis appendix for image credits.
 */
export const PLANET_TEXTURE_URL: Record<PlanetName, string> = {
  Mercury: `${WM}/4/4a/Mercury_in_true_color.jpg`,
  Venus: `${WM}/0/08/Venus_from_Mariner_10.jpg`,
  Earth: "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
  Mars: `${WM}/0/02/OSIRIS_Mars_true_color.jpg`,
  Jupiter: `${WM}/7/76/Jupiter%2C_image_taken_by_NASA%27s_Hubble_Space_Telescope%2C_June_2019_%28cropped%29.png`,
  Saturn: `${WM}/c/c7/Saturn_during_Equinox.jpg`,
  Uranus: `${WM}/3/3d/Uranus2.jpg`,
  Neptune: "https://threejs.org/examples/textures/planets/moon_1024.jpg",
};
