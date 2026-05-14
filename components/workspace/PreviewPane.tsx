import { EmptyState, PanelHeader } from "./AssetGallery";
import {
  RestoreStrategySchema,
  UIElementTypeSchema,
  type RestoreStrategy,
  type UIElement,
  type UIElementType,
} from "@/core/manifest";

type PreviewPaneProps = {
  assetsGenerated: boolean;
  generated: boolean;
  verified: boolean;
};

export function PreviewPane({
  assetsGenerated,
  generated,
  verified,
}: PreviewPaneProps) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#171a21]">
      <PanelHeader
        title="Preview"
        subtitle={generated ? "React + Tailwind output" : "等待生成"}
      />
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-[#101217] p-4">
        <div className="grid aspect-[390/844] h-full max-h-[178px] min-h-[136px] overflow-hidden rounded-[16px] border border-white/15 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.34)]">
          {generated ? (
            <GeneratedMock />
          ) : (
            <div className="grid place-items-center p-5 text-center text-xs text-slate-500">
              <div>
                <strong className="text-slate-800">
                  {assetsGenerated ? "准备生成界面" : "等待资产"}
                </strong>
                <p className="mt-2 leading-5">
                  {assetsGenerated
                    ? "资产已就绪，可以生成 React/Tailwind 预览。"
                    : "先生成 crop / regenerate 资产，再生成界面。"}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 flex w-full max-w-xl items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
          <span>视觉验证</span>
          <strong className={verified ? "text-emerald-200" : "text-slate-500"}>
            {verified ? "0.84 相似度" : "未验证"}
          </strong>
        </div>
      </div>
    </section>
  );
}

type PropertiesPanelProps = {
  selectedElement?: UIElement;
  verified: boolean;
  onSelectNextReviewElement: () => void;
  onUpdateElement: (elementId: string, patch: Partial<UIElement>) => void;
};

const strategies = RestoreStrategySchema.options;
const elementTypes = UIElementTypeSchema.options;

export function PropertiesPanel({
  selectedElement,
  verified,
  onSelectNextReviewElement,
  onUpdateElement,
}: PropertiesPanelProps) {
  return (
    <aside className="grid min-h-0 grid-rows-[48px_minmax(0,1fr)_64px] border-l border-white/10 bg-[#171a21]">
      <div className="flex items-center justify-between border-b border-white/10 px-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Properties</h2>
          <span className="text-xs text-slate-500">
            Selection and approval
          </span>
        </div>
        <span
          className={[
            "rounded px-2 py-1 text-xs",
            !selectedElement
              ? "bg-white/[0.06] text-slate-500"
              : selectedElement.needsReview
              ? "bg-amber-300/10 text-amber-200"
              : "bg-emerald-300/10 text-emerald-200",
          ].join(" ")}
        >
          {!selectedElement
            ? "未选择"
            : selectedElement.needsReview
              ? "需要检查"
              : "已接受"}
        </span>
      </div>

      <div className="min-h-0 overflow-auto p-3">
        {!selectedElement ? (
          <div className="grid min-h-40 place-items-center text-center text-sm text-slate-500">
            选择一个图层或标注框后编辑属性。
          </div>
        ) : (
          <ElementDetail
            element={selectedElement}
            onUpdate={(patch) => onUpdateElement(selectedElement.id, patch)}
            verified={verified}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-3">
        <button
          className="h-9 flex-1 rounded-md border border-white/10 bg-white/[0.06] text-sm font-medium text-slate-200 hover:bg-white/[0.1]"
          onClick={onSelectNextReviewElement}
          type="button"
        >
          跳转待检
        </button>
        <button
          className="h-9 flex-1 rounded-md border border-emerald-300/20 bg-emerald-300/10 text-sm font-medium text-emerald-100 hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/[0.03] disabled:text-slate-600"
          disabled={!selectedElement}
          onClick={() =>
            selectedElement
              ? onUpdateElement(selectedElement.id, { needsReview: false })
              : undefined
          }
          type="button"
        >
          批准策略
        </button>
      </div>
    </aside>
  );
}

export function DiffPane({ verified }: { verified: boolean }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#171a21]">
      <PanelHeader title="差异对比" subtitle="原图 / 渲染 / 差异" />
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-3 gap-3">
          <DiffBox>原图</DiffBox>
          <DiffBox>渲染图</DiffBox>
          <DiffBox>差异图</DiffBox>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
          <span>相似度</span>
          <strong className={verified ? "text-emerald-200" : "text-slate-500"}>
            {verified ? "0.84（模拟）" : "未验证"}
          </strong>
        </div>
      </div>
    </section>
  );
}

export function TaskLog({ logs }: { logs: string[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#171a21]">
      <PanelHeader title="任务日志" subtitle="流水线事件" />
      {logs.length === 0 ? (
        <EmptyState>暂无任务日志。</EmptyState>
      ) : (
        <div className="flex-1 overflow-auto p-3">
          {logs.map((log, index) => (
            <div
              className="border-b border-white/5 py-1.5 text-xs leading-5 text-slate-400 last:border-b-0"
              key={index}
            >
              {log}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DiffBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-sm text-slate-500">
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-slate-200">{value}</span>
    </div>
  );
}

function ElementDetail({
  element,
  onUpdate,
  verified,
}: {
  element: UIElement;
  onUpdate: (patch: Partial<UIElement>) => void;
  verified: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">
              {element.id}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              bbox [{element.bbox.join(", ")}]
            </div>
          </div>
          <span className="rounded bg-white/[0.06] px-2 py-1 text-xs text-slate-300">
            {Math.round(element.confidence * 100)}%
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          <InfoRow label="类型" value={element.type} />
          <InfoRow label="策略" value={element.strategy} />
          <InfoRow label="验证" value={verified ? "0.84 相似度" : "未验证"} />
        </div>
      </div>

      <Field label="类型">
        <select
          className="w-full rounded-md border border-white/10 bg-[#111318] px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
          onChange={(event) =>
            onUpdate({ type: event.target.value as UIElementType })
          }
          value={element.type}
        >
          {elementTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </Field>

      <Field label="还原策略">
        <select
          className="w-full rounded-md border border-white/10 bg-[#111318] px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
          onChange={(event) =>
            onUpdate({
              strategy: event.target.value as RestoreStrategy,
              needsReview: false,
            })
          }
          value={element.strategy}
        >
          {strategies.map((strategy) => (
            <option key={strategy} value={strategy}>
              {strategy}
            </option>
          ))}
        </select>
      </Field>

      <Field label="重绘提示词">
        <textarea
          className="min-h-20 w-full resize-y rounded-md border border-white/10 bg-[#111318] px-2 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/60"
          onChange={(event) => onUpdate({ prompt: event.target.value })}
          placeholder="仅在 regenerate 策略下使用"
          value={element.prompt ?? ""}
        />
      </Field>

      <Field label="判断原因">
        <textarea
          className="min-h-20 w-full resize-y rounded-md border border-white/10 bg-[#111318] px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
          onChange={(event) => onUpdate({ reason: event.target.value })}
          value={element.reason}
        />
      </Field>
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function GeneratedMock() {
  return (
    <div className="relative bg-[#f7f8fb]">
      <div className="absolute left-5 right-5 top-9 flex items-center justify-between">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-500 to-yellow-400" />
        <div className="h-8 w-8 rounded-full border border-slate-200 bg-white" />
      </div>
      <div className="absolute left-5 right-5 top-[92px] h-[132px] rounded-[16px] bg-gradient-to-br from-sky-600 via-cyan-500 to-emerald-500 shadow-lg">
        <div className="absolute left-5 top-6 h-4 w-28 rounded-full bg-white/85" />
        <div className="absolute left-5 top-[58px] h-10 w-40 rounded-xl bg-white/25" />
      </div>
      <div className="absolute left-5 top-[246px] flex gap-2">
        <div className="h-7 w-16 rounded-full bg-slate-950" />
        <div className="h-7 w-16 rounded-full border border-slate-200 bg-white" />
        <div className="h-7 w-16 rounded-full border border-slate-200 bg-white" />
      </div>
      <PreviewCard top={306} />
      <PreviewCard top={386} />
      <div className="absolute bottom-5 left-5 right-5 flex h-12 items-center justify-around rounded-[18px] bg-slate-950">
        <span className="h-6 w-6 rounded-full bg-white/25" />
        <span className="h-6 w-6 rounded-full bg-white/25" />
        <span className="h-6 w-6 rounded-full bg-white/25" />
        <span className="h-6 w-6 rounded-full bg-white/25" />
      </div>
    </div>
  );
}

function PreviewCard({ top }: { top: number }) {
  return (
    <div
      className="absolute left-5 right-5 h-[68px] rounded-[13px] border border-slate-200 bg-white"
      style={{ top }}
    >
      <div className="absolute left-3 top-3 h-11 w-11 rounded-xl bg-gradient-to-br from-violet-400 to-sky-400" />
      <div className="absolute left-[68px] top-4 h-2.5 w-36 rounded-full bg-slate-300" />
      <div className="absolute left-[68px] top-9 h-2.5 w-24 rounded-full bg-slate-200" />
    </div>
  );
}
