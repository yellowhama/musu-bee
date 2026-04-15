import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/tokens.css";
import TasksView from "./TasksView";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TasksView />
  </StrictMode>,
);
