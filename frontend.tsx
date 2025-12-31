import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

function App() {
  return (
    <div className="app">
      <h1>Collector</h1>
      <p>Welcome to your Bun + React application!</p>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
