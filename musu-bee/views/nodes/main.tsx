import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/tokens.css";
import NodesView from "./NodesView";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NodesView />
  </StrictMode>,
);
