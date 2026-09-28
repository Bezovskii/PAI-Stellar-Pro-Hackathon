import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import { Web3Provider } from "./context/Web3Context.jsx";
import { StellarWalletProvider } from "./context/StellarWalletContext.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <StellarWalletProvider>
        <Web3Provider>
          <App />
        </Web3Provider>
      </StellarWalletProvider>
    </BrowserRouter>
  </StrictMode>
);