import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { BootSplash } from "@/components/BootSplash";
import { OfflineWatcher } from "@/components/OfflineWatcher";
import { EncyclopediaLayout } from "@/components/encyclopedia/EncyclopediaLayout";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { ToastProvider } from "@/components/ui/Toast";
import { DemoPage } from "@/pages/DemoPage";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import { BirthdayPage } from "@/pages/BirthdayPage";
import { ComparePlanetsPage } from "@/pages/ComparePlanetsPage";
import { EncyclopediaPage } from "@/pages/EncyclopediaPage";
import { GiftPage } from "@/pages/GiftPage";
import { GlossaryPage } from "@/pages/GlossaryPage";
import { HistoricMissionsPage } from "@/pages/HistoricMissionsPage";
import { KeplerLabPage } from "@/pages/KeplerLabPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OrbitalLabPage } from "@/pages/OrbitalLabPage";
import { PlanetDetailPage } from "@/pages/PlanetDetailPage";
import { QualityPage } from "@/pages/QualityPage";
import { StudioLivePage } from "@/pages/StudioLivePage";
import { StudioPage } from "@/pages/StudioPage";
import { WelcomePage } from "@/pages/WelcomePage";

function DocumentLangSync() {
  const { i18n } = useTranslation();
  useEffect(() => {
    const lng = (i18n.resolvedLanguage ?? i18n.language).toLowerCase();
    document.documentElement.lang = lng.startsWith("tr") ? "tr" : "en";
  }, [i18n, i18n.language, i18n.resolvedLanguage]);
  return null;
}

function AchievementBoot() {
  const track = useAchievementTracker();
  useEffect(() => {
    track("app:opened");
  }, [track]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <DocumentLangSync />
      <ToastProvider>
        <BootSplash>
          <AchievementBoot />
          <OfflineWatcher />
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/studio" element={<StudioLayout />}>
              <Route index element={<StudioPage />} />
              <Route path="live" element={<StudioLivePage />} />
              <Route path="demo" element={<DemoPage />} />
              <Route path="quality" element={<QualityPage />} />
            </Route>
            <Route path="/encyclopedia" element={<EncyclopediaLayout />}>
              <Route index element={<EncyclopediaPage />} />
              <Route path="glossary" element={<GlossaryPage />} />
              <Route path="lab" element={<OrbitalLabPage />} />
              <Route path="kepler" element={<KeplerLabPage />} />
              <Route path="missions" element={<HistoricMissionsPage />} />
              <Route path="compare" element={<ComparePlanetsPage />} />
              <Route path=":name" element={<PlanetDetailPage />} />
            </Route>
            <Route path="/birthday" element={<BirthdayPage />} />
            <Route path="/gift/:token" element={<GiftPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BootSplash>
      </ToastProvider>
    </BrowserRouter>
  );
}
