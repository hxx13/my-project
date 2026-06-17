import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import {
  FaceCameraWindow,
  FaceDynamicIsland,
  FaceEnrollment,
  useFaceModels,
  useFaceVerification,
  shouldKeepFaceCameraSession,
} from '@/components/face-verify';
import { FACE_VERIFY_MAX_RETRIES, faceAutoRetryDelayMs, faceVerifyFailedLabel } from '@/components/face-verify/faceConfig';
import {
  uploadDebugPhoto,
  listDebugPhotos,
  deleteDebugPhoto,
  fetchBaselinePhoto,
  uploadBaselinePhoto,
  compareFaces,
} from '@/api/domains/face.api';
import { searchPersonnel } from '@/api/domains/profile.api';
import type { PersonnelRecord } from '@/api/types/profile';
import type { FaceDebugPhoto, ScanStatus } from '@/components/face-verify';
import {
  Upload,
  Camera,
  Trash2,
  RefreshCw,
  Loader2,
  X,
  UserSearch,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';
import { randomUUID } from '@/utils/randomUUID';

export default function FaceDebugPage() {
  useFaceModels();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionIdRef = useRef(randomUUID());

  // ---- 生产门禁验证（与扫码页一致：底库 + useFaceVerification + /api/face/verify）----
  const [keyword, setKeyword] = useState('');
  const [searchingUser, setSearchingUser] = useState(false);
  const [userOptions, setUserOptions] = useState<PersonnelRecord[]>([]);
  const [selectedUser, setSelectedUser] = useState<PersonnelRecord | null>(null);
  const [baselineUrls, setBaselineUrls] = useState<string[]>([]);
  const [baselineCount, setBaselineCount] = useState(0);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [verifyActive, setVerifyActive] = useState(false);
  const [islandStatus, setIslandStatus] = useState<ScanStatus>('idle');
  const [lastVerifySummary, setLastVerifySummary] = useState<string>('');
  const [enrollBaselineOpen, setEnrollBaselineOpen] = useState(false);

  const verifyOptions = useMemo(
    () => ({
      userId: selectedUser?.user_id,
      userName: selectedUser?.name,
      baselineCount,
      sessionId: sessionIdRef.current,
      source: 'gate' as const,
    }),
    [selectedUser, baselineCount],
  );

  const {
    status: faceStatus,
    similarity,
    retryCount,
    blinkPhase,
    serverVerifying,
    challengeAction,
    start: faceStart,
    stop: faceStop,
    retry: faceRetry,
    reset: faceReset,
  } = useFaceVerification(videoRef, baselineUrls, verifyOptions);

  const loadBaselineForUser = useCallback(async (user: PersonnelRecord) => {
    setBaselineLoading(true);
    try {
      const data = await fetchBaselinePhoto(user.user_id);
      setBaselineUrls(data.urls ?? []);
      setBaselineCount(data.count ?? 0);
      return data;
    } finally {
      setBaselineLoading(false);
    }
  }, []);

  const handleSearchUsers = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setSearchingUser(true);
    try {
      const rows = await searchPersonnel(kw);
      setUserOptions(rows ?? []);
    } catch (e) {
      console.error('[FaceDebug] 搜索人员失败:', e);
      setUserOptions([]);
    } finally {
      setSearchingUser(false);
    }
  }, [keyword]);

  const handleSelectUser = useCallback(
    async (user: PersonnelRecord) => {
      setSelectedUser(user);
      setUserOptions([]);
      setKeyword(`${user.name} (${user.user_id})`);
      await loadBaselineForUser(user);
    },
    [loadBaselineForUser],
  );

  const stopVerifySession = useCallback(() => {
    faceStop();
    faceReset();
    setVerifyActive(false);
    setIslandStatus('idle');
  }, [faceStop, faceReset]);

  const startProductionVerify = useCallback(async () => {
    if (!selectedUser) return;
    const data = await loadBaselineForUser(selectedUser);
    if (!data.hasBaseline || data.count <= 0) {
      setLastVerifySummary('该人员无底库照片，请先录入底库后再验证');
      return;
    }
    sessionIdRef.current = randomUUID();
    setLastVerifySummary('');
    setVerifyActive(true);
    setIslandStatus('scanning');
    await faceStart();
  }, [selectedUser, loadBaselineForUser, faceStart]);

  useEffect(() => {
    if (faceStatus === 'matched') {
      setIslandStatus('success');
      setLastVerifySummary(
        similarity != null
          ? `验证通过 · 相似度 ${(similarity * 100).toFixed(1)}% · 路线 B 服务端比对`
          : '验证通过',
      );
    } else if (faceStatus === 'mismatched' || faceStatus === 'timeout' || faceStatus === 'maxRetries' || faceStatus === 'noFace') {
      setIslandStatus('failed');
      if (similarity != null) {
        setLastVerifySummary(`验证未通过 · 相似度 ${(similarity * 100).toFixed(1)}% · ${faceVerifyFailedLabel(faceStatus === 'maxRetries' ? 'maxRetries' : faceStatus === 'timeout' ? 'timeout' : 'mismatched')}`);
      }
    }
  }, [faceStatus, similarity]);

  useEffect(() => {
    if (!verifyActive || retryCount >= FACE_VERIFY_MAX_RETRIES - 1) return;
    const retryable = faceStatus === 'timeout' || faceStatus === 'mismatched';
    if (!retryable) return;
    const delayMs = faceAutoRetryDelayMs(retryCount);
    const timer = window.setTimeout(() => {
      void faceRetry();
      setIslandStatus('scanning');
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [verifyActive, faceStatus, retryCount, faceRetry]);

  // ---- 辅助：调试照片库 + 后端两两比对 ----
  const [photos, setPhotos] = useState<FaceDebugPhoto[]>([]);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [compareResult, setCompareResult] = useState<string>('');
  const [compareBusy, setCompareBusy] = useState(false);
  const [debugEnrollOpen, setDebugEnrollOpen] = useState(false);

  const loadPhotos = useCallback(async () => {
    try {
      const data = await listDebugPhotos();
      setPhotos(data || []);
    } catch (err) {
      console.error('[FaceDebug] 加载照片失败:', err);
    }
  }, []);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  const handleUpload = useCallback(
    async (file: File, label: string) => {
      try {
        const result = await uploadDebugPhoto(file, label);
        if (result?.url) await loadPhotos();
      } catch (err) {
        console.error('[FaceDebug] 上传失败:', err);
      }
    },
    [loadPhotos],
  );

  const runBackendCompare = useCallback(async () => {
    if (!compareA || !compareB) return;
    setCompareBusy(true);
    try {
      const r = await compareFaces(compareA, compareB);
      setCompareResult(
        `相似度 ${(r.similarity * 100).toFixed(1)}% · ${r.matched ? '判定为同一人' : '判定为不同人'}`,
      );
    } catch (e) {
      setCompareResult(e instanceof Error ? e.message : '比对失败');
    } finally {
      setCompareBusy(false);
    }
  }, [compareA, compareB]);

  return (
    <AdminPageShell
      title="人脸识别调试"
      description="生产验证：选择有底库的人员，走与扫码门禁相同的服务端路线 B（/api/face/verify）"
    >
      <FaceDynamicIsland
        status={islandStatus}
        retryAttempt={retryCount}
        failedLabel={faceVerifyFailedLabel(
          faceStatus === 'maxRetries' ? 'maxRetries' : faceStatus === 'timeout' ? 'timeout' : 'mismatched',
        )}
        onStatusComplete={(s) => {
          if (s === 'success' || s === 'failed') stopVerifySession();
        }}
      />

      {/* 生产门禁验证 */}
      <div className="mb-6 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-primary)] bg-[var(--app-color-surface-card)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--app-color-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)]">生产门禁验证（路线 B）</h3>
        </div>
        <p className="mb-4 text-xs text-[var(--app-color-text-secondary)]">
          与扫码页 / 调试导航一致：加载人员底库 → 活体双步（眨眼+转头）→ 服务端 FaceNet 比对。
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearchUsers()}
            placeholder="姓名 / 工号 / 手机"
            className="min-w-[200px] flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-primary)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)]"
          />
          <button
            type="button"
            onClick={() => void handleSearchUsers()}
            disabled={searchingUser}
            className="flex items-center gap-2 rounded-lg bg-[var(--app-color-accent)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-inverse)] hover:opacity-90 disabled:opacity-50"
          >
            {searchingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserSearch className="h-4 w-4" />}
            搜索人员
          </button>
        </div>

        {userOptions.length > 0 && (
          <ul className="mb-3 max-h-40 overflow-auto rounded-lg border border-[var(--app-color-border-primary)]">
            {userOptions.map((u) => (
              <li key={u.user_id}>
                <button
                  type="button"
                  onClick={() => void handleSelectUser(u)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--app-color-surface-hover)]"
                >
                  {u.name} · {u.user_id} · {u.department_name || '—'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedUser && (
          <div className="mb-3 rounded-lg border border-[var(--app-color-border-primary)] bg-[var(--app-color-surface-page)] p-3 text-sm">
            <div className="font-medium text-[var(--app-color-text-primary)]">
              {selectedUser.name}（{selectedUser.user_id}）
            </div>
            <div className="mt-1 text-xs text-[var(--app-color-text-secondary)]">
              底库：
              {baselineLoading ? (
                <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
              ) : (
                `${baselineCount} 张${baselineCount > 0 ? ' · 可验证' : ' · 需先录入'}`
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void startProductionVerify()}
            disabled={!selectedUser || baselineCount <= 0 || verifyActive}
            className="flex items-center gap-2 rounded-lg bg-[var(--app-color-feedback-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            <Camera className="h-4 w-4" />
            开始门禁验证
          </button>
          <button
            type="button"
            onClick={() => selectedUser && setEnrollBaselineOpen(true)}
            disabled={!selectedUser}
            className="flex items-center gap-2 rounded-lg border border-[var(--app-color-border-primary)] px-4 py-2 text-sm text-[var(--app-color-text-primary)] hover:border-[var(--app-color-accent)]"
          >
            录入/更新底库
          </button>
          {verifyActive && (
            <button
              type="button"
              onClick={stopVerifySession}
              className="rounded-lg bg-[var(--app-color-feedback-danger)] px-4 py-2 text-sm font-medium text-white"
            >
              停止验证
            </button>
          )}
        </div>

        {lastVerifySummary && (
          <p className="mt-3 text-xs text-[var(--app-color-text-secondary)]">{lastVerifySummary}</p>
        )}
        {verifyActive && similarity != null && faceStatus === 'detecting' && (
          <p className="mt-2 text-xs text-[var(--app-color-text-tertiary)]">
            实时相似度 {(similarity * 100).toFixed(1)}%
          </p>
        )}
      </div>

      {verifyActive && (
        <FaceCameraWindow
          cameraOwner="gate"
          cameraWarm
          videoRef={videoRef}
          open={shouldKeepFaceCameraSession(islandStatus)}
          blinkPhase={blinkPhase}
          serverVerifying={serverVerifying}
          challengeAction={challengeAction}
          onClose={stopVerifySession}
        />
      )}

      {/* 辅助：调试照片 + 后端 compare API */}
      <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-primary)] bg-[var(--app-color-surface-card)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[var(--app-color-text-secondary)]" />
          <h3 className="text-sm font-medium text-[var(--app-color-text-primary)]">辅助工具：调试照片库</h3>
          <span className="text-xs text-[var(--app-color-text-tertiary)]">（不参与生产 verify，仅测 /api/face/debug/compare）</span>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--app-color-border-primary)] px-4 py-2 text-sm hover:border-[var(--app-color-accent)]">
            <Upload className="h-4 w-4" />
            上传调试照
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f, f.name.replace(/\.[^.]+$/, ''));
              }}
            />
          </label>
          <button type="button" onClick={() => setDebugEnrollOpen(true)} className="rounded-lg border px-4 py-2 text-sm">
            调试真人录入
          </button>
          <button type="button" onClick={() => void loadPhotos()} className="rounded-lg px-4 py-2 text-sm text-[var(--app-color-text-secondary)]">
            <RefreshCw className="mr-1 inline h-3 w-3" />
            刷新
          </button>
        </div>

        {photos.length >= 2 && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--app-color-border-primary)] p-3">
            <label className="text-xs text-[var(--app-color-text-secondary)]">
              照片 A
              <select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                className="mt-1 block rounded border px-2 py-1 text-sm"
              >
                <option value="">选择</option>
                {photos.map((p) => (
                  <option key={p.id} value={p.publicUrl}>
                    #{p.id} {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--app-color-text-secondary)]">
              照片 B
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                className="mt-1 block rounded border px-2 py-1 text-sm"
              >
                <option value="">选择</option>
                {photos.map((p) => (
                  <option key={p.id} value={p.publicUrl}>
                    #{p.id} {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!compareA || !compareB || compareBusy}
              onClick={() => void runBackendCompare()}
              className="rounded-lg bg-[var(--app-color-accent)] px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              {compareBusy ? '比对中…' : '后端比对'}
            </button>
            {compareResult && <span className="text-xs text-[var(--app-color-text-secondary)]">{compareResult}</span>}
          </div>
        )}

        {photos.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--app-color-text-secondary)]">暂无调试照片</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
            {photos.map((p) => (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-lg border border-[var(--app-color-border-primary)]"
              >
                <img src={p.publicUrl} alt={p.label} className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`删除 "${p.label}"？`)) return;
                    await deleteDebugPhoto(p.id);
                    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
                  }}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--app-color-feedback-danger)] text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white">
                  {p.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {enrollBaselineOpen && selectedUser && (
        <FaceEnrollment
          userId={selectedUser.user_id}
          replaceExisting
          uploadFn={async (file) => uploadBaselinePhoto(selectedUser.user_id, file)}
          onCaptured={async () => {
            setEnrollBaselineOpen(false);
            await loadBaselineForUser(selectedUser);
          }}
          onCancel={() => setEnrollBaselineOpen(false)}
        />
      )}

      {debugEnrollOpen && (
        <FaceEnrollment
          uploadFn={async (file) => {
            const result = await uploadDebugPhoto(file, 'camera-enroll');
            return result.url;
          }}
          onCaptured={() => {
            setDebugEnrollOpen(false);
            void loadPhotos();
          }}
          onCancel={() => setDebugEnrollOpen(false)}
        />
      )}
    </AdminPageShell>
  );
}
