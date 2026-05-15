/** 大环境层：弱网格 + 扫描带，不抢主体对比度 */
export function DtAmbientLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="dt-ambient-grid absolute inset-0" />
      <div className="dt-ambient-scan absolute inset-0" />
    </div>
  );
}
