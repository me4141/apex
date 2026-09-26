import React, { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ApexApp } from "./apex/ApexApp";
import { getV2Route } from "./v2/router";
import "./styles/globals.css";

const AppShellV2 = lazy(() => import("./v2/AppShellV2").then((module) => ({ default: module.AppShellV2 })));

const UI_MODE_KEY = "apex.ui.mode";

function resolveMode(): "apex" | "v2" {
  const requested = new URLSearchParams(window.location.search).get("ui");
  if (requested === "v2" || requested === "apex") {
    localStorage.setItem(UI_MODE_KEY, requested);
    return requested;
  }
  return localStorage.getItem(UI_MODE_KEY) === "v2" ? "v2" : "apex";
}

function Root() {
  const [revision, setRevision] = useState(0);
  const mode = resolveMode();

  useEffect(() => {
    const onRoute = () => setRevision((value) => value + 1);
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, []);

  void revision;
  const route = getV2Route();
  // Standalone panels and mature daemon Rooms stay on their existing shell.
  // Closing a Room returns to the cinematic home without losing the choice.
  if (mode === "v2" || route.kind !== "home") return <Suspense fallback={null}><AppShellV2 /></Suspense>;
  return <ApexApp />;
}

const root = createRoot(document.getElementById("root")!);
root.render(<Root />);
