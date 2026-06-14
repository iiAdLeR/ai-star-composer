import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Environment, OrbitControls, PerformanceMonitor, Stars, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Suspense, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useTranslation } from "react-i18next";

import { PLANETS, type PlanetName, type StyleId } from "@/lib/api";
import { PLANET_VISUAL } from "@/components/planets/planetVisuals";
import { PLANET_TEXTURE_URL } from "@/components/planets/planetTextureUrls";
import { PLANET_FACTS } from "@/components/planets/planetFacts";
import { getPlanetTheme } from "@/lib/planetTheme";

const N = PLANETS.length;
const RING_RADIUS = 5.35;
const CAROUSEL_Y = 0.35;
const SELECTED_SCALE_MUL = 1.06;
const BOB_AMPLITUDE = 0.035;
const OVERVIEW_CAMERA: [number, number, number] = [0, 0.35, 10.8];

type CameraMode = "static" | "orbit" | "showcase";
type QualityLevel = "low" | "medium" | "high";

function SaturnRings() {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1}>
      <torusGeometry args={[1.38, 0.065, 2, 128]} />
      <meshStandardMaterial color="#d8c8a8" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function PlanetSurface({
  name,
  selected,
  onSelect,
  onExplore,
}: {
  name: PlanetName;
  selected: boolean;
  onSelect: () => void;
  onExplore: () => void;
}) {
  const url = PLANET_TEXTURE_URL[name];
  const tex = useTexture(url);
  const cfg = PLANET_VISUAL[name];
  useLayoutEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex]);

  return (
    <mesh
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onExplore();
      }}
    >
      <sphereGeometry args={[1, 72, 72]} />
      <meshStandardMaterial
        map={tex}
        color={name === "Neptune" ? "#7aa8ee" : "#ffffff"}
        roughness={name === "Earth" ? 0.48 : name === "Jupiter" ? 0.62 : 0.82}
        metalness={name === "Earth" ? 0.06 : 0.04}
        emissive={selected ? cfg.emissive : "#080810"}
        emissiveIntensity={selected ? 0.2 : 0.08}
      />
    </mesh>
  );
}

const PlanetBody = forwardRef<
  THREE.Group,
  {
    name: PlanetName;
    selected: boolean;
    cameraMode: CameraMode;
    onSelect: () => void;
    onExplore: () => void;
  }
>(function PlanetBody({ name, selected, cameraMode, onSelect, onExplore }, forwardedRef) {
  const innerRef = useRef<THREE.Group>(null);
  useImperativeHandle(forwardedRef, () => innerRef.current!, []);
  const t = useRef(0);
  const cfg = PLANET_VISUAL[name];

  useFrame((_, delta) => {
    t.current += delta;
    if (!innerRef.current) return;
    const show = selected && cameraMode === "showcase";
    innerRef.current.position.y = selected ? Math.sin(t.current * 2) * BOB_AMPLITUDE : 0;
    innerRef.current.position.x = show ? Math.sin(t.current * 0.7) * 0.18 : 0;
    innerRef.current.position.z = show ? Math.cos(t.current * 0.56) * 0.16 : 0;
    innerRef.current.rotation.y += delta * (show ? 0.85 : 0.2);
    const s = cfg.scale * (selected ? SELECTED_SCALE_MUL : 1);
    innerRef.current.scale.setScalar(THREE.MathUtils.lerp(innerRef.current.scale.x, s, 0.1));
  });

  return (
    <group ref={innerRef}>
      <Suspense fallback={null}>
        <PlanetSurface name={name} selected={selected} onSelect={onSelect} onExplore={onExplore} />
      </Suspense>
      {name === "Saturn" ? <SaturnRings /> : null}
    </group>
  );
});

function OverviewSnap({ cameraMode }: { cameraMode: CameraMode }) {
  const camera = useThree((s) => s.camera);
  const prev = useRef<CameraMode>("showcase");
  useLayoutEffect(() => {
    if (prev.current !== "static" && cameraMode === "static") {
      camera.position.set(OVERVIEW_CAMERA[0], OVERVIEW_CAMERA[1], OVERVIEW_CAMERA[2]);
    }
    prev.current = cameraMode;
  }, [cameraMode, camera]);
  return null;
}

function StaticCameraRig() {
  const camera = useThree((s) => s.camera);
  const look = useMemo(() => new THREE.Vector3(0, CAROUSEL_Y, RING_RADIUS), []);
  useFrame(() => {
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
  });
  return null;
}

function ShowcaseCameraRig({ selectedIndex, planetRefs }: { selectedIndex: number; planetRefs: React.MutableRefObject<(THREE.Group | null)[]> }) {
  const camera = useThree((s) => s.camera);
  const t = useRef(0);
  const anchor = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    t.current += dt;
    const p = planetRefs.current[selectedIndex];
    if (!p) return;
    p.getWorldPosition(anchor);
    const dist = THREE.MathUtils.clamp(PLANET_VISUAL[PLANETS[selectedIndex]].scale * 3.3, 2.4, 6.4);
    const cx = Math.sin(t.current * 0.34) * (dist * 0.26);
    const cy = CAROUSEL_Y + Math.sin(t.current * 0.24) * 0.22;
    const cz = anchor.z + dist;
    camera.position.set(THREE.MathUtils.lerp(camera.position.x, cx, 0.05), THREE.MathUtils.lerp(camera.position.y, cy, 0.05), THREE.MathUtils.lerp(camera.position.z, cz, 0.05));
    camera.lookAt(anchor);
  });
  return null;
}

function OrbitCameraRig({ selectedIndex, planetRefs }: { selectedIndex: number; planetRefs: React.MutableRefObject<(THREE.Group | null)[]> }) {
  const ctrl = useRef<OrbitControlsImpl | null>(null);
  const targetVec = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const p = planetRefs.current[selectedIndex];
    if (!p) return;
    p.getWorldPosition(targetVec);
    if (ctrl.current) {
      ctrl.current.target.lerp(targetVec, 0.14);
      ctrl.current.update();
    }
  });
  return (
    <OrbitControls
      ref={ctrl}
      enableDamping
      dampingFactor={0.065}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI - 0.1}
      minDistance={1.35}
      maxDistance={24}
      enablePan={false}
      rotateSpeed={0.62}
      zoomSpeed={0.72}
    />
  );
}

function PlanetCarousel({
  selectedIndex,
  onSelectIndex,
  dragTwist,
  cameraMode,
  planetRefs,
  onExplorePlanet,
}: {
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  dragTwist: number;
  cameraMode: CameraMode;
  planetRefs: React.MutableRefObject<(THREE.Group | null)[]>;
  onExplorePlanet: (i: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetY = useRef(0);
  const baseAngle = useMemo(() => -(selectedIndex / N) * Math.PI * 2, [selectedIndex]);

  useEffect(() => {
    targetY.current = baseAngle + dragTwist;
  }, [baseAngle, dragTwist]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetY.current, 3.6, delta);
  });

  return (
    <group ref={groupRef} position={[0, CAROUSEL_Y, 0]}>
      {PLANETS.map((name, i) => {
        const a = (i / N) * Math.PI * 2;
        const x = Math.sin(a) * RING_RADIUS;
        const z = Math.cos(a) * RING_RADIUS;
        return (
          <group key={name} position={[x, 0, z]} onPointerDown={(e) => e.stopPropagation()}>
            <PlanetBody
              ref={(el) => {
                planetRefs.current[i] = el;
              }}
              name={name}
              selected={i === selectedIndex}
              cameraMode={cameraMode}
              onSelect={() => onSelectIndex(i)}
              onExplore={() => onExplorePlanet(i)}
            />
          </group>
        );
      })}
    </group>
  );
}

function Scene({
  selectedIndex,
  onSelectIndex,
  dragTwist,
  cameraMode,
  quality,
  fxEnabled,
  onQualityAuto,
  planetRefs,
  onExplorePlanet,
}: {
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  dragTwist: number;
  cameraMode: CameraMode;
  quality: QualityLevel;
  fxEnabled: boolean;
  onQualityAuto: (q: QualityLevel, fps: number) => void;
  planetRefs: React.MutableRefObject<(THREE.Group | null)[]>;
  onExplorePlanet: (i: number) => void;
}) {
  const starsCount = quality === "low" ? 2400 : quality === "medium" ? 4200 : 6200;
  return (
    <>
      <PerformanceMonitor
        onChange={({ fps }) => {
          const q: QualityLevel = fps < 42 ? "low" : fps < 56 ? "medium" : "high";
          onQualityAuto(q, fps);
        }}
      />
      <AdaptiveDpr pixelated />
      <color attach="background" args={["#020108"]} />
      <Suspense fallback={null}>
        <Environment preset="night" environmentIntensity={quality === "low" ? 0.18 : 0.28} />
      </Suspense>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={["#4466aa", "#1a1008", 0.55]} />
      <directionalLight position={[0, 0.22, 11.6]} intensity={1.25} color="#fff8f0" />
      <directionalLight position={[-7.5, 3.2, 4]} intensity={0.4} color="#a8c8ff" />
      <pointLight position={[10, 8, 12]} intensity={0.8} color="#ffe8d0" distance={90} decay={2} />
      <Stars radius={120} depth={60} count={starsCount} factor={4} saturation={0} fade speed={0.4} />
      <OverviewSnap cameraMode={cameraMode} />
      {cameraMode === "static" ? <StaticCameraRig /> : null}
      {cameraMode === "showcase" ? <ShowcaseCameraRig selectedIndex={selectedIndex} planetRefs={planetRefs} /> : null}
      {cameraMode === "orbit" ? <OrbitCameraRig selectedIndex={selectedIndex} planetRefs={planetRefs} /> : null}
      <PlanetCarousel
        selectedIndex={selectedIndex}
        onSelectIndex={onSelectIndex}
        dragTwist={dragTwist}
        cameraMode={cameraMode}
        planetRefs={planetRefs}
        onExplorePlanet={onExplorePlanet}
      />
      {fxEnabled && quality !== "low" ? (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.38} luminanceSmoothing={0.15} intensity={0.26} />
          <Vignette eskil={false} offset={0.25} darkness={0.52} />
        </EffectComposer>
      ) : null}
    </>
  );
}

export type PlanetPicker3DProps = {
  value: string;
  onChange: (planet: string) => void;
  className?: string;
};

export function PlanetPicker3D({ value, onChange, className = "" }: PlanetPicker3DProps) {
  const { t } = useTranslation();
  const selectedIndex = Math.max(0, PLANETS.indexOf(value as PlanetName));
  const [dragTwist, setDragTwist] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("showcase");
  const [fxEnabled, setFxEnabled] = useState(true);
  const [quality, setQuality] = useState<QualityLevel>("high");
  const [fps, setFps] = useState(60);
  // The blurb card covers the planet on phones (the 3D viewport is only
  // 50dvh tall there). We hide it by default on small screens and expose a
  // tiny info toggle so the user can summon it on demand without ever
  // losing sight of the planet on first paint.
  const [infoOpen, setInfoOpen] = useState(false);

  const dragStartX = useRef(0);
  const dragStartTwist = useRef(0);
  const dragTwistRef = useRef(0);
  dragTwistRef.current = dragTwist;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const planetRefs = useRef<(THREE.Group | null)[]>([]);

  const dpr: [number, number] = quality === "low" ? [0.7, 1] : quality === "medium" ? [0.9, 1.4] : [1, 2];
  const facts = PLANET_FACTS[PLANETS[selectedIndex]];

  const setIndex = useCallback(
    (i: number) => {
      const next = ((i % N) + N) % N;
      onChange(PLANETS[next]);
    },
    [onChange],
  );

  const snapFromDrag = useCallback(() => {
    const tw = dragTwistRef.current;
    const seg = (Math.PI * 2) / N;
    const steps = Math.round(-tw / seg);
    setDragTwist(0);
    if (steps !== 0) {
      setIndex(selectedIndexRef.current + steps);
    }
  }, [setIndex]);

  useEffect(() => {
    if (!dragging) return;
    const DRAG_SENS = 0.0065;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - dragStartX.current;
      setDragTwist(dragStartTwist.current + dx * DRAG_SENS);
    };
    const onUp = () => {
      setDragging(false);
      snapFromDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, snapFromDrag]);

  const goPrev = useCallback(() => {
    setIndex(selectedIndexRef.current - 1);
  }, [setIndex]);

  const goNext = useCallback(() => {
    setIndex(selectedIndexRef.current + 1);
  }, [setIndex]);

  const onExplorePlanet = useCallback(
    (i: number) => {
      setIndex(i);
    },
    [setIndex],
  );

  useEffect(() => {
    if (cameraMode !== "orbit") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCameraMode("showcase");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cameraMode]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (cameraMode === "orbit") return;
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartTwist.current = dragTwistRef.current;
    setDragging(true);
  };

  const selectedTheme = getPlanetTheme(PLANETS[selectedIndex]);
  const btnCls = "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-black/40 text-xl text-white shadow-lg shadow-black/40 backdrop-blur-md transition disabled:cursor-not-allowed disabled:opacity-40";
  const navBtnStyle = {
    borderColor: `color-mix(in srgb, ${selectedTheme.accent} 45%, transparent)`,
    boxShadow: `0 0 18px color-mix(in srgb, ${selectedTheme.glow} 35%, transparent)`,
  } as const;
  const toggleBtn = "rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition hover:border-cyan-400/50 hover:bg-cyan-500/15";
  const modeBtn = (v: CameraMode) => `${toggleBtn} ${cameraMode === v ? "border-cyan-400/55 bg-cyan-500/20" : ""}`;
  const styleNames = (facts.bestStyles as StyleId[]).join(" · ");

  return (
    <div className={`relative flex h-full min-h-0 w-full flex-col ${className}`}>
      <div
        className={`relative min-h-0 flex-1 touch-none select-none ${
          cameraMode === "orbit"
            ? "cursor-default"
            : dragging
              ? "cursor-grabbing"
              : "cursor-grab"
        }`}
        onPointerDown={cameraMode === "orbit" ? undefined : onPointerDown}
      >
        <Canvas
          className="absolute inset-0 block h-full w-full"
          camera={{ position: [...OVERVIEW_CAMERA], fov: 36, near: 0.08, far: 280 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          dpr={dpr}
          onCreated={({ gl }) => {
            // ACESFilmic gives the bloomed highlights a much cleaner roll-off
            // than the default linear tone mapping - planets stop blowing out
            // at the bright limb when Bloom is active.
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.15;
          }}
        >
          <Suspense fallback={null}>
            <Scene
              selectedIndex={selectedIndex}
              onSelectIndex={setIndex}
              dragTwist={dragTwist}
              cameraMode={cameraMode}
              quality={quality}
              fxEnabled={fxEnabled}
              onQualityAuto={(q, f) => {
                setQuality((prev) => (prev === q ? prev : q));
                setFps(Math.round(f));
              }}
              planetRefs={planetRefs}
              onExplorePlanet={onExplorePlanet}
            />
          </Suspense>
        </Canvas>

        {/* Mobile info toggle: a small "i" pill that does not occlude the
            planet. Tap to peek the blurb, tap again to dismiss. */}
        <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          className="pointer-events-auto absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm font-semibold text-cyan-100 shadow-lg shadow-black/40 backdrop-blur-md transition hover:border-cyan-400/45 hover:bg-cyan-500/15 sm:hidden"
          aria-label={infoOpen ? t("studio.planetPicker.hideInfo", "Hide info") : t("studio.planetPicker.showInfo", "Show info")}
          aria-expanded={infoOpen}
        >
          <span aria-hidden>{infoOpen ? "×" : "i"}</span>
        </button>

        <div
          className={`pointer-events-none absolute left-3 top-3 z-20 max-w-[min(18rem,62vw)] rounded-xl border border-white/15 bg-black/55 p-2.5 text-xs backdrop-blur-md transition ${
            infoOpen ? "block translate-y-12 opacity-100" : "hidden opacity-0"
          } sm:block sm:translate-y-0 sm:opacity-100`}
        >
          <p className="font-semibold text-cyan-100">{PLANETS[selectedIndex]}</p>
          <p className="mt-1 text-white/70">{facts.blurb}</p>
          <p className="mt-2 text-[11px] text-cyan-200/75">{t("studio.planetPicker.bestStyles")}: {styleNames}</p>
        </div>
      </div>

      <div className="pointer-events-auto relative z-10 shrink-0 border-t border-white/10 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-5 lg:px-6">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:mb-3">
          <p className="w-full text-center text-[10px] uppercase tracking-[0.18em] text-white/40 sm:text-[11px]">{t("studio.planetPicker.hint")}</p>
          <button type="button" className={modeBtn("static")} onClick={() => setCameraMode("static")}>{t("studio.planetPicker.static")}</button>
          <button type="button" className={modeBtn("orbit")} onClick={() => setCameraMode("orbit")}>{t("studio.planetPicker.orbit")}</button>
          <button type="button" className={modeBtn("showcase")} onClick={() => setCameraMode("showcase")}>{t("studio.planetPicker.showcase")}</button>
          <button type="button" className={toggleBtn} onClick={() => setFxEnabled((v) => !v)}>
            {fxEnabled ? t("studio.planetPicker.fxOn") : t("studio.planetPicker.fxOff")}
          </button>
          <span className="text-[10px] text-cyan-200/65 sm:text-[11px]">{t("studio.planetPicker.quality")}: {quality} · {fps} FPS</span>
        </div>
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 sm:gap-3">
          <button type="button" className={btnCls} style={navBtnStyle} onClick={goPrev} aria-label="Previous planet" disabled={cameraMode === "orbit"}>‹</button>
          <div className="min-w-0 flex-1 text-center">
            <p
              className="font-display text-2xl font-bold tracking-tight text-white drop-shadow-lg md:text-3xl"
              style={{ textShadow: `0 0 24px color-mix(in srgb, ${selectedTheme.glow} 50%, transparent)` }}
            >
              {PLANETS[selectedIndex]}
            </p>
            <p className="text-xs" style={{ color: selectedTheme.text }}>{t("studio.planetPicker.selected")}</p>
          </div>
          <button type="button" className={btnCls} style={navBtnStyle} onClick={goNext} aria-label="Next planet" disabled={cameraMode === "orbit"}>›</button>
        </div>
      </div>
    </div>
  );
}
