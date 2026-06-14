import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type StudioPlanetContextValue = {
  planet: string;
  setPlanet: (p: string) => void;
};

const StudioPlanetContext = createContext<StudioPlanetContextValue | null>(null);

export function StudioPlanetProvider({ children }: { children: ReactNode }) {
  const [planet, setPlanet] = useState("Mars");
  const value = useMemo(() => ({ planet, setPlanet }), [planet]);
  return <StudioPlanetContext.Provider value={value}>{children}</StudioPlanetContext.Provider>;
}

export function useStudioPlanet(): StudioPlanetContextValue {
  const ctx = useContext(StudioPlanetContext);
  if (!ctx) {
    throw new Error("useStudioPlanet must be used inside StudioPlanetProvider");
  }
  return ctx;
}
