import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { i18nReady } from "@/i18n/config";

import App from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

void i18nReady.then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
