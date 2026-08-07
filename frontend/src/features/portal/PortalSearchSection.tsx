import { useState, useRef } from "react";
import { Search, ArrowRight, Sparkles, Dna, Microscope } from "lucide-react";
import { cn } from "@/lib/utils";

const PLACEHOLDERS = [
  "搜索基因编辑模型品系…",
  "搜索免疫缺陷模型…",
  "查找人源化小鼠…",
  "搜索疾病模型资源…",
];

export function PortalSearchSection() {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholderIdx = Math.floor(Math.random() * PLACEHOLDERS.length);

  return (
    <section className="min-h-screen flex items-center relative overflow-hidden bg-white py-24 px-6">
      {/* Decorative background blobs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-amber-50/60 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-orange-50/40 rounded-full blur-3xl" />

      <div className="max-w-2xl mx-auto relative z-10 w-full">
        {/* Icon row */}
        <div className="flex justify-center gap-8 mb-8">
          <div className="size-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <Dna className="size-6 text-amber-500" />
          </div>
          <div className="size-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center">
            <Microscope className="size-6 text-orange-500" />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center mb-3">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.15em] text-amber-600 uppercase">
            <Sparkles className="size-3" />
            模型资源检索
          </div>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 text-center mb-8">
          查找您需要的实验动物模型
        </h2>

        {/* Search bar */}
        <div
          className={cn(
            "relative group flex items-center gap-3 rounded-2xl border bg-white px-5 py-4 transition-all duration-300 cursor-text",
            focused
              ? "border-amber-400 shadow-lg shadow-amber-100/50 ring-4 ring-amber-50"
              : "border-neutral-200 shadow-sm hover:border-neutral-300 hover:shadow-md",
          )}
          onClick={() => inputRef.current?.focus()}
        >
          <div
            className={cn(
              "size-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300",
              focused ? "bg-amber-100" : "bg-neutral-100",
            )}
          >
            <Search
              className={cn(
                "size-5 transition-colors duration-300",
                focused ? "text-amber-600" : "text-neutral-400",
              )}
            />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            className="flex-1 bg-transparent text-[15px] text-neutral-900 placeholder:text-neutral-300 outline-none border-none"
          />

          <button
            type="button"
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-300",
              value.trim()
                ? "bg-neutral-900 text-white hover:bg-neutral-800"
                : "bg-neutral-100 text-neutral-400",
            )}
          >
            <span className="hidden sm:inline">搜索</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>

        {/* Quick tags */}
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {["CRISPR/Cas9", "NSG小鼠", "人源化模型", "PDX模型", "疾病模型"].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setValue(tag);
                inputRef.current?.focus();
              }}
              className="px-3.5 py-1.5 rounded-full text-[12px] font-medium text-neutral-500 bg-neutral-100 hover:bg-amber-50 hover:text-amber-700 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
