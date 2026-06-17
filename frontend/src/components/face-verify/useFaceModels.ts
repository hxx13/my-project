import { useState, useEffect, useCallback, useRef } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';

interface FaceModelsState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

// 模块级缓存：整个应用生命周期只加载一次
let globalLoaded = false;
let globalLoading = false;
let globalPromise: Promise<void> | null = null;
let globalError: string | null = null;

/** 确保 face-api 模型已加载（录入/验证页可直接调用，不依赖其他页面预加载） */
export async function ensureModelsLoaded(): Promise<void> {
  if (globalLoaded) return;
  if (globalPromise) {
    await globalPromise;
    if (globalError) throw new Error(globalError);
    return;
  }

  globalLoading = true;
  globalPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      globalLoaded = true;
      globalError = null;
    } catch (err: unknown) {
      globalError = err instanceof Error ? err.message : '模型加载失败';
      throw err;
    } finally {
      globalLoading = false;
    }
  })();

  try {
    await globalPromise;
  } catch {
    globalPromise = null;
    if (globalError) throw new Error(globalError);
    throw new Error('模型加载失败');
  }
}

export function useFaceModels(): FaceModelsState {
  const [loaded, setLoaded] = useState(globalLoaded);
  const [loading, setLoading] = useState(globalLoading);
  const [error, setError] = useState<string | null>(globalError);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadModels = useCallback(async () => {
    if (globalLoaded) {
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      await ensureModelsLoaded();
      if (mountedRef.current) {
        setLoaded(true);
        setLoading(false);
        setError(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '模型加载失败';
      if (mountedRef.current) {
        setError(msg);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!globalLoaded) {
      void loadModels();
    }
  }, [loadModels]);

  return { loaded, loading, error };
}

/** @deprecated 请用 ensureModelsLoaded；保留别名兼容旧调用 */
export function waitForModels(): Promise<void> {
  return ensureModelsLoaded();
}
