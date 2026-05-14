import type { UIManifest } from "@/core/manifest";

type AssetGalleryProps = {
  manifest: UIManifest;
  generated: boolean;
};

export function AssetGallery({ manifest, generated }: AssetGalleryProps) {
  const assetElements = manifest.elements.filter((element) =>
    ["crop", "regenerate"].includes(element.strategy),
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#171a21]">
      <PanelHeader title="资产" subtitle={`${assetElements.length} 个裁剪 / 重绘产物`} />
      {!generated ? (
        <EmptyState>资产尚未生成。生成后会在这里按元素展示裁剪和重绘结果。</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-2 overflow-auto p-3">
          {assetElements.map((element) => (
            <div
              className="grid min-h-[104px] grid-rows-[1fr_auto] rounded-md border border-white/10 bg-white/[0.04] p-2"
              key={element.id}
            >
              <div className="rounded bg-[linear-gradient(135deg,rgba(56,189,248,0.22),rgba(16,185,129,0.18)),linear-gradient(45deg,rgba(255,255,255,0.06)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.06)_50%,rgba(255,255,255,0.06)_75%,transparent_75%)] bg-[size:auto,14px_14px]" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-xs text-slate-300">
                  {element.id}
                </div>
                <span className="rounded bg-white/[0.06] px-1.5 py-1 text-[11px] text-slate-400">
                  {element.strategy}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between border-b border-white/10 px-3">
      <h2 className="text-sm font-semibold text-slate-100">
        {title}
        {subtitle ? (
          <span className="ml-2 text-xs font-medium text-slate-500">
            {subtitle}
          </span>
        ) : null}
      </h2>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-28 flex-1 place-items-center p-4 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
