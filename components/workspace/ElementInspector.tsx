"use client";

import type { RestoreStrategy, UIManifest } from "@/core/manifest";

type ElementInspectorProps = {
  manifest: UIManifest;
  selectedElementId?: string;
  onSelectElement: (elementId: string) => void;
  onSelectNextReviewElement: () => void;
};

const strategyDotClass: Record<RestoreStrategy, string> = {
  asset: "bg-rose-600",
  code: "bg-blue-600",
  crop: "bg-green-600",
  regenerate: "bg-orange-600",
  ignore: "bg-gray-500",
};

export function ElementInspector({
  manifest,
  selectedElementId,
  onSelectElement,
  onSelectNextReviewElement,
}: ElementInspectorProps) {
  const reviewCount = manifest.elements.filter((element) => element.needsReview)
    .length;

  return (
    <aside className="grid min-h-0 grid-rows-[48px_minmax(0,1fr)] border-r border-white/10 bg-[#171a21]">
      <div className="flex items-center justify-between border-b border-white/10 px-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Layers</h2>
          <span className="text-xs text-slate-500">
            {manifest.elements.length} elements
          </span>
        </div>
        <button
          className="h-7 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 text-xs font-medium text-amber-100 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/[0.03] disabled:text-slate-600"
          disabled={reviewCount === 0}
          onClick={onSelectNextReviewElement}
          type="button"
        >
          下一个待检查元素
        </button>
      </div>

      <div className="min-h-0 overflow-auto p-2">
        {manifest.elements.map((element) => (
          <button
            className={[
              "group grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-2 text-left transition",
              selectedElementId === element.id
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-50"
                : "border-transparent text-slate-300 hover:bg-white/[0.06]",
            ].join(" ")}
            key={element.id}
            onClick={() => onSelectElement(element.id)}
            type="button"
          >
            <span
              className={`h-2.5 w-2.5 rounded-sm ${
                strategyDotClass[element.strategy]
              }`}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {element.id}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {element.type} · {Math.round(element.confidence * 100)}%
              </span>
            </span>
            <span
              className={[
                "rounded px-1.5 py-1 text-[11px]",
                element.needsReview
                  ? "bg-amber-300/10 text-amber-200"
                  : "bg-emerald-300/10 text-emerald-200",
              ].join(" ")}
            >
              {element.needsReview ? "review" : "ok"}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
