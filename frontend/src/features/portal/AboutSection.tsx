import { Building2, Users, Globe, BookOpen, ArrowRight } from "lucide-react";
import { TextType } from "@/components/text-type";
import DecryptedText from "@/components/decrypted-text/DecryptedText";
import { StaggerCards } from "@/components/scroll-reveal";

const TYPEWRITER_LINES = [
  "普通动物饲养品种：犬、猴、猪、兔、仓鼠、豚鼠、小鼠、大鼠\n特殊实验动物品种：裸鼹鼠、地松鼠等",
  "依托胚胎生物技术平台，保有2122个基因编辑动物品系\n坚持临床科研一体化，服务302个课题组及13家附属医院",
  "2025年协助医学院系统获得920项国家自然科学基金\n连续十六年保持全国医学院校第一",
  "全国高校唯一同时拥有CNAS和AAALAC国际认可\n建设有20多个实验动物研究平台，100多项技术检测",
];

export function AboutSection() {
  return (
    <section id="about" className="min-h-screen flex items-center py-24 px-6 bg-neutral-50">
      <div className="max-w-7xl mx-auto">

        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-600 uppercase mb-3">About Us</p>
          <h2 className="text-3xl font-bold text-neutral-900">
            <DecryptedText
              text="实验动物科学部"
              speed={40} maxIterations={12} sequential
              revealDirection="center" useOriginalCharsOnly
              className="text-neutral-900"
              encryptedClassName="text-neutral-400"
            />
          </h2>
          <p className="mt-4 text-[15px] text-neutral-600 max-w-3xl mx-auto leading-relaxed">
            上海交通大学医学院实验动物科学部，占地面积约2482.72m²，建筑面积17602m²，
            设计笼位5.2万，为全国高校单体最大的实验动物设施。
          </p>
        </div>

        <div className="max-w-5xl mx-auto mb-16 py-16 px-8 rounded-2xl border border-neutral-200 bg-white shadow-sm portal-typewriter-card">
          <style>{`
            .portal-typewriter-card .text-type { font-size: clamp(1.25rem, 4vw, 2.5rem) !important; font-weight: 700 !important; line-height: 1.5 !important; text-align: center !important; width: 100% !important; display: block !important; }
          `}</style>
          <div className="flex items-center justify-center overflow-hidden" style={{ height: "16rem" }}>
            <TextType
              text={TYPEWRITER_LINES}
              typingSpeed={55}
              pauseDuration={2200}
              deletingSpeed={25}
              loop
              showCursor
              cursorCharacter="▍"
              cursorBlinkDuration={0.4}
              cursorClassName="text-amber-500"
              textColors={["#262626"]}
            />
          </div>
        </div>

        <StaggerCards className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-3xl mx-auto mb-16">
          {[
            { value: "17,602", unit: "m²", label: "建筑面积", icon: Building2 },
            { value: "5.2", unit: "万笼", label: "设计笼位", icon: BookOpen },
            { value: "2,122", unit: "个", label: "基因编辑品系", icon: Users },
            { value: "302", unit: "个", label: "服务课题组", icon: Globe },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="text-center p-6 rounded-2xl border border-neutral-200 bg-white hover:shadow-sm transition-shadow">
                <Icon className="size-5 text-amber-500 mx-auto mb-3" />
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-bold text-neutral-900 tabular-nums">{stat.value}</span>
                  <span className="text-base text-neutral-400">{stat.unit}</span>
                </div>
                <p className="mt-1.5 text-sm text-neutral-500">{stat.label}</p>
              </div>
            );
          })}
        </StaggerCards>

        <div className="text-center">
          <a href="/#/about" className="inline-flex items-center gap-2 text-sm font-medium text-amber-600 hover:underline">
            了解更多关于我们 <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
