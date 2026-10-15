import { memo, useCallback, useRef } from "react";
import type { FloorPlan, FloorPlanShape } from "@/api/domains/avidity.api";
import "./avidity-floorplan.css";


/**
 * 「今日有报警但当前已恢复」那档的颜色深浅按**真实次数**分档。
 * 这套系统一天里绝大多数点位都会报几次（实测 149 个点位有 119 个今天报过），
 * 一律涂成同一个琥珀色等于没分档。次数到 {@link WARN_SATURATE} 就饱和 ——
 * 只是个视觉上限，不影响次数本身的展示。
 */
const WARN_SATURATE = 30;

export type PointState = "normal" | "warn" | "alarm";

/**
 * 格子的外扩量（px，画布坐标）。
 * 原图元件是 14×14，缩到整屏后数字挤成一团、看不清 —— 用户要求「稍微大几个像素，但也不要太大」。
 * 这里只在外层加边距，不动原图坐标，格心位置不变。
 */
const CELL_PAD = 3;

/** 拖动后的位置覆盖：key = 房间/笼架/点位号 */
export type OverrideMap = Record<string, { x: number; y: number }>;

export const pointKey = (room: string, rack: string, no: number) => `${room}/${rack}/${no}`;

interface Props {
  plan: FloorPlan;
  /** 点位标识（原图的 variableName）→ 今日累计次数 */
  countOf: (varName: string) => number;
  /** 点位标识 → 当前状态 */
  stateOf: (varName: string) => PointState;
  /** 拖动过、还没保存的位置 */
  overrides?: OverrideMap;
  /** 编辑模式：点位可拖 */
  editing?: boolean;
  onDragPoint?: (room: string, rack: string, no: number, x: number, y: number) => void;
  /** 非编辑态点击点位 —— 用来看该点位的报警历史 */
  onPick?: (room: string, rack: string, no: number, varName: string) => void;
}


/** [a,b,c,d,e,f] → SVG transform 属性 */
const mtx = (m: FloorPlanShape["m"]) => `matrix(${m.join(",")})`;

function AvidityFloorPlanInner({ plan, countOf, stateOf, overrides, editing, onDragPoint, onPick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ room: string; rack: string; no: number; dx: number; dy: number } | null>(null);

  const [vw, vh] = plan.size;
  // 画幅按内容实际范围给（后端算好的），缺了就退回原图整幅
  const viewBox = (plan.viewBox && plan.viewBox.length === 4 ? plan.viewBox : [0, 0, vw, vh]).join(" ");
  // 兜底：布局文件是后端按画面 ID 发的静态资源，新旧版本会并存（部署时漏更新就少字段）。
  // 少字段只该少画东西，不该把整页打崩。
  const pipes = plan.pipes ?? [];
  const rooms = plan.rooms ?? [];
  const regulators = plan.regulators ?? [];

  /** 客户端坐标 → SVG 用户坐标（拖动要按画布坐标算，不能按屏幕像素） */
  const toUser = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse());
  }, []);

  const startDrag = (room: string, rack: string, no: number, px: number, py: number) => (e: React.PointerEvent) => {
    if (!editing || !onDragPoint) return;
    const u = toUser(e.clientX, e.clientY);
    if (!u) return;
    dragRef.current = { room, rack, no, dx: u.x - px, dy: u.y - py };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !onDragPoint) return;
    const u = toUser(e.clientX, e.clientY);
    if (!u) return;
    onDragPoint(d.room, d.rack, d.no, Math.round(u.x - d.dx), Math.round(u.y - d.dy));
  };

  const endDrag = () => { dragRef.current = null; };

  const hasAlarm = rooms.some((room) =>
    room.racks.some((rack) => rack.points.some((p) => stateOf(p.var) === "alarm"))
  );

  return (
    <svg ref={svgRef} className="av-plan" viewBox={viewBox} data-alarm={hasAlarm}
         data-editing={editing ? "true" : "false"} role="img" aria-label="饮水流量监测平面图"
         onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
      {/* ⓪ 房间底面：**原图轮廓线围出来的矩形**（统一大小、成列对齐）。
          不做格线、不按内容撑大小 —— 房间尺寸照原图。 */}
      <g>
        {rooms.map((room) => {
          if (!room.box) return null;
          const [bx, by, bw, bh] = room.box;
          return (
            <rect key={`room-${room.room}`} className="av-room-panel"
                  x={bx} y={by} width={bw} height={bh} rx={8} />
          );
        })}
      </g>


      {/* ①b 内间框：前室里的分隔。
          2F 是套间结构 —— 202 是前室，202-A/202-B 是要从前室进去的内间，
          这些框由原图房间内部的分隔线围出来（不是按点位撑的）。 */}
      <g>
        {rooms.map((room) =>
          room.racks.map((rack) =>
            rack.box ? (
              <rect key={`ib-${rack.rack}`} className="av-inner-room"
                    x={rack.box[0]} y={rack.box[1]} width={rack.box[2]} height={rack.box[3]} rx={5} />
            ) : null
          )
        )}
      </g>

      {/* ② 房间号（画在底面之上、管道之下，被管子压住也不影响读） */}
      <g>
        {rooms.map((room) =>
          room.label ? (
            <text key={`rn-${room.room}`} className="av-room-name" x={room.label[0]} y={room.label[1] + 13}>
              {room.room}
            </text>
          ) : null
        )}
      </g>

      {/* ③ 管道网络：外壳 + 流动芯。主管（房间外）比支管（进房间）粗且深 */}
      <g>
        {pipes.map((p, i) => (
          <path key={`pc${i}`} className={`av-pipe-casing${p.main ? " main" : ""}`} d={p.d} transform={mtx(p.m)} />
        ))}
        {pipes.map((p, i) => (
          <path key={`pf${i}`} className={`av-pipe-flow${p.main ? " main" : ""}`} data-rev={p.rev ? "true" : "false"} d={p.d} transform={mtx(p.m)} />
        ))}
      </g>

      {/* ④ 笼架名与减压阀 */}
      <g>
        {rooms.map((room) =>
          room.racks.map((rack) => (
            <text key={rack.rack} className="av-rack-name" x={rack.label[0]} y={rack.label[1] + 10}>
              {rack.display ?? rack.rack}
            </text>
          ))
        )}
        {regulators.map((reg) => (
          <text key={`${reg.name}-${reg.x}`} className="av-reg-name" x={reg.x} y={reg.y + 12}>{reg.name}</text>
        ))}
      </g>

      {/* ⑤ 点位格：报警态才是重点 */}
      <g>
        {rooms.map((room) =>
          room.racks.map((rack) =>
            rack.points.map((p) => {
              const w = (p.w ?? 14) + CELL_PAD * 2;
              const h = (p.h ?? 14) + CELL_PAD * 2;
              const state = stateOf(p.var);
              const count = countOf(p.var);
              const moved = overrides?.[pointKey(room.room, rack.rack, p.no)];
              const px = (moved ? moved.x : p.x) - CELL_PAD;
              const py = (moved ? moved.y : p.y) - CELL_PAD;
              const cx = px + w / 2;
              const cy = py + h / 2;
              const label = `${room.room} 前室 · ${rack.display ?? rack.rack} 内间 · ${p.no} 号点位` +
                (state === "alarm" ? " · 报警中" : count > 0 ? ` · 今日 ${count} 次` : " · 正常");
              // 报警态外观走 CSS；已恢复那档按真实次数给底色深浅
              const t = Math.min(1, count / WARN_SATURATE);
              // warn 档跟「正常」要一眼分得开：底色和描边都再压重一档，并给个最小可见度
              const warnStyle = state === "warn"
                ? { fill: `rgba(224,140,26,${(0.16 + 0.34 * t).toFixed(3)})`,
                    stroke: `rgba(214,124,10,${(0.55 + 0.40 * t).toFixed(3)})` }
                : undefined;
              return (
                <g key={`${rack.rack}-${p.no}`} className="av-point" data-state={state}
                   onPointerDown={startDrag(room.room, rack.rack, p.no, px, py)}
                   onClick={() => { if (!editing) onPick?.(room.room, rack.rack, p.no, p.var); }}
                   style={editing ? undefined : { cursor: "pointer" }}>
                  <title>{label}</title>
                  <rect className="av-cell-ring" x={px} y={py} width={w} height={h} rx={3} />
                  <rect className="av-cell" x={px} y={py} width={w} height={h} rx={3} style={warnStyle} />
                  <text className="av-cell-no" x={cx} y={cy}>{p.no}</text>
                </g>
              );
            })
          )
        )}
      </g>
    </svg>
  );
}

export default memo(AvidityFloorPlanInner);
