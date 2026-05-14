"use client";

import type { UIElement, UIManifest } from "@/core/manifest";

type SourceCanvasProps = {
  assetCount: number;
  manifest: UIManifest;
  reviewCount: number;
  selectedElement?: UIElement;
  selectedElementId?: string;
  onSelectElement: (elementId: string) => void;
};

const strategyClass: Record<string, string> = {
  asset: "border-rose-400 bg-rose-400/10 text-rose-200",
  code: "border-sky-400 bg-sky-400/10 text-sky-200",
  crop: "border-emerald-400 bg-emerald-400/10 text-emerald-200",
  regenerate: "border-orange-400 bg-orange-400/10 text-orange-200",
  ignore: "border-gray-400 bg-gray-400/10 text-gray-200",
};

export function SourceCanvas({
  assetCount,
  manifest,
  reviewCount,
  selectedElement,
  selectedElementId,
  onSelectElement,
}: SourceCanvasProps) {
  const { width, height } = manifest.sourceImage;

  return (
    <section className="grid min-h-0 grid-rows-[44px_minmax(0,1fr)_34px] bg-[#101217]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#171a21] px-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Canvas</h2>
          <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-400">
            {width} x {height}
          </span>
          <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-400">
            {assetCount} assets
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-[#111318] p-1">
          <ToolPill active>选择</ToolPill>
          <ToolPill>检查</ToolPill>
          <ToolPill>对比</ToolPill>
        </div>
      </div>

      <div className="relative grid min-h-0 place-items-center overflow-auto bg-[linear-gradient(#1b1e26_1px,transparent_1px),linear-gradient(90deg,#1b1e26_1px,transparent_1px)] bg-[size:24px_24px] p-8">
        <div className="absolute left-4 top-4 rounded-md border border-white/10 bg-[#171a21]/95 px-3 py-2 text-xs text-slate-400 shadow-2xl">
          <span className="text-slate-200">{reviewCount}</span> 待检查 · 缩放 82%
        </div>
        <div
          className="relative w-full max-w-[390px] overflow-visible rounded-[26px] bg-slate-200 shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          <div className="absolute -inset-3 rounded-[32px] border border-white/10 bg-black/20" />
          <div className="relative h-full overflow-hidden rounded-[24px] border border-white/20 bg-slate-200">
            <MockPhoneUi />
          </div>
          {manifest.elements.map((element) => {
            const [x, y, boxWidth, boxHeight] = element.bbox;
            const selected = selectedElementId === element.id;
            return (
              <button
                aria-label={`选择元素 ${element.id}`}
                className={[
                  "absolute z-10 border-2 text-left transition hover:bg-white/10",
                  "focus:outline-none focus:ring-2 focus:ring-slate-800 focus:ring-offset-2",
                  strategyClass[element.strategy],
                  selected
                    ? "ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#101217]"
                    : "",
                  element.needsReview
                    ? "shadow-[inset_0_0_0_2px_rgba(251,191,36,0.9)]"
                    : "",
                ].join(" ")}
                data-strategy={element.strategy}
                key={element.id}
                onClick={() => onSelectElement(element.id)}
                style={{
                  left: `${(x / width) * 100}%`,
                  top: `${(y / height) * 100}%`,
                  width: `${(boxWidth / width) * 100}%`,
                  height: `${(boxHeight / height) * 100}%`,
                }}
                title={`${element.id} (${element.strategy})`}
                type="button"
              >
                <span className="absolute -left-0.5 -top-7 max-w-44 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-current px-1.5 py-1 text-[11px] leading-none shadow-lg">
                  <span className="text-[#111318]">{element.id}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 bg-[#171a21] px-3 text-xs text-slate-500">
        <span>
          {selectedElement
            ? `${selectedElement.id} · ${selectedElement.type} · ${selectedElement.strategy}`
            : "未选择元素"}
        </span>
        <span>
          {selectedElement ? `bbox [${selectedElement.bbox.join(", ")}]` : ""}
        </span>
      </div>
    </section>
  );
}

function ToolPill({
  active = false,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={[
        "h-7 rounded px-2 text-xs transition",
        active
          ? "bg-white text-slate-950"
          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100",
      ].join(" ")}
      type="button"
    >
      {children}
    </button>
  );
}

function MockPhoneUi() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.28),transparent_32%),linear-gradient(180deg,#f8fbff_0%,#eef4f8_48%,#f7f8fb_100%)]">
      <div className="absolute left-[22px] right-[22px] top-[42px] flex h-[52px] items-center justify-between">
        <div className="h-[42px] w-[42px] rounded-full bg-gradient-to-br from-orange-500 to-yellow-400" />
        <div className="h-9 w-9 rounded-full border border-slate-300 bg-white" />
      </div>

      <div className="absolute left-[22px] right-[22px] top-[116px] h-[170px] rounded-[18px] bg-[radial-gradient(circle_at_75%_28%,rgba(255,255,255,0.82),transparent_16%),linear-gradient(135deg,#2563eb,#06b6d4_52%,#10b981)] shadow-xl">
        <div className="absolute left-6 top-8 h-5 w-36 rounded-full bg-white/85" />
        <div className="absolute left-6 top-[70px] h-[52px] w-56 rounded-xl bg-white/30" />
      </div>

      <div className="absolute left-[22px] top-[314px] flex gap-[9px]">
        <div className="h-8 w-[74px] rounded-full bg-slate-900" />
        <div className="h-8 w-[74px] rounded-full border border-slate-200 bg-white" />
        <div className="h-8 w-[74px] rounded-full border border-slate-200 bg-white" />
      </div>

      <MockCard top={372} />
      <MockCard top={474} />

      <div className="absolute bottom-[22px] left-[22px] right-[22px] flex h-[62px] items-center justify-around rounded-[22px] bg-slate-950">
        <div className="h-[30px] w-[30px] rounded-full bg-white/25" />
        <div className="h-[30px] w-[30px] rounded-full bg-white/25" />
        <div className="h-[30px] w-[30px] rounded-full bg-white/25" />
        <div className="h-[30px] w-[30px] rounded-full bg-white/25" />
      </div>
    </div>
  );
}

function MockCard({ top }: { top: number }) {
  return (
    <div
      className="absolute left-[22px] right-[22px] h-[86px] rounded-[14px] border border-slate-200 bg-white"
      style={{ top }}
    >
      <div className="absolute left-4 top-[15px] h-14 w-14 rounded-xl bg-gradient-to-br from-purple-400 to-blue-400" />
      <div className="absolute left-[88px] top-5 h-3 w-44 rounded-full bg-slate-300" />
      <div className="absolute left-[88px] top-11 h-3 w-28 rounded-full bg-slate-300" />
    </div>
  );
}
