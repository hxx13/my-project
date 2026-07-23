import { useRef, useState } from 'react';
import { ImageIcon, Paperclip, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHelpImageLightbox } from '@/features/page-help/PageHelpImageLightbox';
import { uploadSingleImage } from '@/api/domains/upload.api';
import { uploadAdminFileTemplate, downloadAdminFileTemplateBlob } from '@/api/domains/fileTemplates.api';
import { resolveApiMediaUrl } from '@/utils/mediaUrl';
import {
  parseFileFieldValue,
  serializeFileFieldValue,
  type FileFieldValue,
} from '../utils/fileFieldValue';

type MediaProps = {
  value: unknown;
  onChange?: (value: unknown) => void;
  inlineInputClass: string;
};

export function GridCellImageField({ value, onChange, inlineInputClass }: MediaProps) {
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlStr = value != null && value !== 'null' ? String(value).trim() : '';
  const displayUrl = resolveApiMediaUrl(urlStr) ?? urlStr;

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    setUploading(true);
    try {
      const result = await uploadSingleImage(file);
      onChange?.(result.publicUrl || result.url);
      toast.success('图片已上传');
    } catch (e) {
      toast.error('图片上传失败: ' + (e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-1 min-w-0">
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {urlStr ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1 rounded-[var(--app-radius-xs)] px-2 py-1 text-[11px]
              text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)] transition-colors"
            title="点击预览图片"
          >
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span>预览</span>
          </button>
        ) : null}
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-[var(--app-radius-xs)] px-2 py-1 text-[11px]
            text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors
            disabled:opacity-50"
        >
          <Upload className="w-3 h-3 shrink-0" />
          {uploading ? '上传中…' : urlStr ? '更换' : '上传'}
        </button>
        {urlStr ? (
          <button
            type="button"
            onClick={() => onChange?.('')}
            className="p-1 rounded-[var(--app-radius-xs)] text-[var(--app-color-text-tertiary)]
              hover:text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-surface-hover)]"
            title="清除"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
      </div>
      <input
        type="text"
        value={urlStr}
        onChange={e => onChange?.(e.target.value)}
        className={`${inlineInputClass} text-left max-w-full`}
        placeholder="或粘贴图片链接"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
        }}
      />
      {previewOpen && displayUrl ? (
        <PageHelpImageLightbox
          src={displayUrl}
          alt="填报图片"
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function GridCellFileField({ value, onChange }: Omit<MediaProps, 'inlineInputClass'>) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = parseFileFieldValue(value);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const row = await uploadAdminFileTemplate(file);
      const payload: FileFieldValue = { id: row.id, name: row.originalName };
      onChange?.(serializeFileFieldValue(payload));
      toast.success('文件已上传至模板库');
    } catch (e) {
      toast.error('文件上传失败: ' + (e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDownload = async () => {
    if (!parsed?.id) {
      toast.error('无可用下载（仅保存了文件名）');
      return;
    }
    try {
      const { blob, fileName } = await downloadAdminFileTemplateBlob(parsed.id, parsed.name);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      toast.error('下载失败: ' + (e as Error).message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-1 min-w-0">
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1 rounded-[var(--app-radius-xs)] px-2 py-1 text-[11px]
          text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors
          disabled:opacity-50"
      >
        <Upload className="w-3 h-3 shrink-0" />
        {uploading ? '上传中…' : parsed ? '更换文件' : '上传文件'}
      </button>
      {parsed?.name ? (
        <button
          type="button"
          onClick={() => void handleDownload()}
          className="inline-flex items-center gap-1 max-w-full text-[11px] text-[var(--app-color-accent)]
            hover:underline truncate"
          title={parsed.name}
        >
          <Paperclip className="w-3 h-3 shrink-0" />
          <span className="truncate">{parsed.name}</span>
        </button>
      ) : null}
      {parsed ? (
        <button
          type="button"
          onClick={() => onChange?.('')}
          className="text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)]"
        >
          清除
        </button>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
        }}
      />
    </div>
  );
}

/** 只读展示：图片可点击预览 */
export function GridCellImageReadonly({ value }: { value: unknown }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const urlStr = value != null && value !== 'null' ? String(value).trim() : '';
  const displayUrl = resolveApiMediaUrl(urlStr) ?? urlStr;
  if (!urlStr) return <span className="text-xs text-[var(--app-color-text-tertiary)]">{'\u00a0'}</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-[var(--app-color-accent)] hover:underline"
      >
        <ImageIcon className="w-3.5 h-3.5" />
        图片
      </button>
      {previewOpen && displayUrl ? (
        <PageHelpImageLightbox src={displayUrl} alt="填报图片" onClose={() => setPreviewOpen(false)} />
      ) : null}
    </>
  );
}

export function GridCellFileReadonly({ value }: { value: unknown }) {
  const parsed = parseFileFieldValue(value);
  if (!parsed?.name) return <span className="text-xs text-[var(--app-color-text-tertiary)]">{'\u00a0'}</span>;

  const handleDownload = async () => {
    if (!parsed.id) return;
    try {
      const { blob, fileName } = await downloadAdminFileTemplateBlob(parsed.id, parsed.name);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      toast.error('下载失败: ' + (e as Error).message);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={!parsed.id}
      className="inline-flex items-center gap-1 max-w-full text-xs text-[var(--app-color-accent)] hover:underline truncate disabled:text-[var(--app-color-text-secondary)] disabled:no-underline"
      title={parsed.name}
    >
      <Paperclip className="w-3 h-3 shrink-0" />
      <span className="truncate">{parsed.name}</span>
    </button>
  );
}
