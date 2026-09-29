"use client";
import { useState } from "react";
import { CreateForm } from "./CreateForm";
import { MyTokens } from "./MyTokens";
import { WalletBar } from "./WalletBar";

const TABS = [
  ["create", "Create a token"],
  ["mine", "My tokens"],
] as const;

export function App() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("create");
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="grid gap-6">
      <WalletBar refreshKey={refreshKey} onFunded={refresh} />
      <div role="tablist" aria-label="Sections" className="flex gap-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className="chip"
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") setTab(tab === "create" ? "mine" : "create");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "create" ? <CreateForm onCreated={refresh} /> : <MyTokens refreshKey={refreshKey} onChanged={refresh} />}
      </div>
    </div>
  );
}
