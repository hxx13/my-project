import { useEffect, useRef, useState } from "react";

/**
 * 把「带鉴权取到的 PDF 字节」转成一个只在当前页面有效的 blob URL。
 *
 * 抽出来是因为生命周期有两个坑，各写一遍必然有一处写漏：
 *  ① 异步回来时组件可能已卸载 —— 不判 cancelled 就会对已卸载组件 setState，并漏掉 revoke；
 *  ② 换文档时必须 revoke 旧的，否则整份 PDF 常驻内存，连翻十几份就把标签页撑爆。
 *
 * @param key 变化时重新拉取（如文档 id）；不传则只在挂载时拉一次。
 */
export function usePdfObjectUrl(fetchBlob: () => Promise<Blob>, key: unknown = null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** 用 ref 存回调：调用方一般传内联箭头，进依赖数组会变成每次渲染都重新拉 */
  const fetchRef = useRef(fetchBlob);
  fetchRef.current = fetchBlob;

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    setLoading(true);
    fetchRef.current()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return { url, error, loading };
}
