import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";

const IS_PRODUCTION = import.meta.env.PROD;

// Global unhandled error & rejection handlers — prevent stack leaks in production
window.addEventListener("error", (event) => {
  if (IS_PRODUCTION) {
    event.preventDefault();
    console.error("[GlobalError]", event.error?.message ?? "Unknown error");
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (IS_PRODUCTION) {
    event.preventDefault();
    console.error("[UnhandledRejection]", event.reason?.message ?? "Unknown rejection");
  }
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
