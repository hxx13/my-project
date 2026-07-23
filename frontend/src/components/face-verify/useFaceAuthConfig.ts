import { useState, useEffect, useCallback } from 'react';
import { fetchFaceConfig } from '@/api/domains/face.api';
import type { FaceClientConfig } from '@/api/domains/face.api';
import {
  DEFAULT_FACE_LIVENESS,
  mergeFaceLiveness,
  type FaceLivenessConfig,
} from './faceLivenessConfig';
import {
  DEFAULT_FACE_ENROLL_STRICT,
  mergeFaceEnrollStrict,
  type FaceEnrollStrictThresholds,
} from './faceEnrollStrictConfig';
import {
  DEFAULT_FACE_VERIFY_PREFETCH,
  mergeFaceVerifyPrefetch,
  type FaceVerifyPrefetchConfig,
} from './faceVerifyPrefetchConfig';
import { resolveCameraHttpsExtraPort } from '@/utils/cameraAccess';

/** 模块级缓存：1分钟内不重复请求 */
let cachedConfig: FaceClientConfig | null = null;
let cacheTime = 0;

const FACE_CONFIG_CHANGED_EVENT = 'face-config-changed';

/** 硬性默认值：仅 master 强制开启，分开关尊重 DB/环境变量 */
const HARD_DEFAULTS: Record<string, boolean> = {
  'face.master_enabled': true,
};

/** 管理端保存 face 模块配置后调用，使各业务页立即拉取最新开关 */
export function invalidateFaceAuthConfigCache() {
  cachedConfig = null;
  cacheTime = 0;
  window.dispatchEvent(new CustomEvent(FACE_CONFIG_CHANGED_EVENT));
}

export function useFaceAuthConfig() {
  const [config, setConfig] = useState<Record<string, boolean>>(
    cachedConfig?.switches ?? HARD_DEFAULTS,
  );
  const [liveness, setLiveness] = useState<FaceLivenessConfig>(DEFAULT_FACE_LIVENESS);
  const [enrollStrict, setEnrollStrict] = useState<FaceEnrollStrictThresholds>(DEFAULT_FACE_ENROLL_STRICT);
  const [verifyPrefetch, setVerifyPrefetch] = useState<FaceVerifyPrefetchConfig>(DEFAULT_FACE_VERIFY_PREFETCH);
  const [reloadToken, setReloadToken] = useState(0);

  const loadConfig = useCallback(async (force = false) => {
    if (!force && cachedConfig && Date.now() - cacheTime < 60_000) {
      setConfig(cachedConfig.switches);
      setLiveness(cachedConfig.liveness);
      setEnrollStrict(cachedConfig.enrollStrict);
      setVerifyPrefetch(cachedConfig.verifyPrefetch);
      return;
    }
    try {
      const cfg = await fetchFaceConfig();
      const switches = { ...HARD_DEFAULTS, ...cfg.switches };
      const live = mergeFaceLiveness(cfg.liveness);
      const strict = mergeFaceEnrollStrict(cfg.enrollStrict);
      const prefetch = mergeFaceVerifyPrefetch(cfg.verifyPrefetch);
      cachedConfig = { switches, liveness: live, enrollStrict: strict, verifyPrefetch: prefetch };
      cacheTime = Date.now();
      setConfig(switches);
      setLiveness(live);
      setEnrollStrict(strict);
      setVerifyPrefetch(prefetch);
    } catch {
      setConfig(HARD_DEFAULTS);
      setLiveness(DEFAULT_FACE_LIVENESS);
      setEnrollStrict(DEFAULT_FACE_ENROLL_STRICT);
      setVerifyPrefetch(DEFAULT_FACE_VERIFY_PREFETCH);
    }
  }, []);

  useEffect(() => {
    const onChanged = () => setReloadToken((t) => t + 1);
    window.addEventListener(FACE_CONFIG_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(FACE_CONFIG_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    void loadConfig(reloadToken > 0);
  }, [loadConfig, reloadToken]);

  useEffect(() => {
    void resolveCameraHttpsExtraPort();
  }, []);

  const masterEnabled = config['face.master_enabled'] !== false;

  const isEnabled = (featureKey: string): boolean => {
    if (!masterEnabled) return false;
    const v = config[featureKey];
    if (v === undefined) return true;
    return v === true;
  };

  return {
    config,
    liveness,
    enrollStrict,
    verifyPrefetch,
    masterEnabled,
    isEnabled,
    reloadConfig: () => loadConfig(true),
  };
}
