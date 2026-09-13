import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-modal-layer="true"
    className={cn(
      // 全屏遮罩：勿加 top-16。否则会露出管理后台 sticky header，
      // 叠在半透明顶栏上形成「透明顶栏 / 图层冲突」观感。
      "fixed inset-0 z-[var(--z-overlay)] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showClose?: boolean;
    /** 点击遮罩是否关闭，默认 true */
    closeOnOverlayClick?: boolean;
    /** 覆盖遮罩层 class（如命令面板需高于业务弹层 z-[1200]） */
    overlayClassName?: string;
    /** 左侧/右侧全高抽屉 */
    variant?: "default" | "leftSheet" | "rightSheet";
    /** 不渲染半透明遮罩（仅居中内容；请配合 `<Dialog modal={false}>` 以免焦点陷阱异常） */
    overlay?: "default" | "none";
    /** modal={false} 时 Radix 不渲染 Overlay；设为 true 时用静态遮罩（帮助弹窗等） */
    alwaysShowOverlay?: boolean;
  }
>(({ className, children, showClose = true, closeOnOverlayClick = true, overlayClassName, variant = "default", overlay = "default", alwaysShowOverlay = false, onInteractOutside, onPointerDownOutside, onFocusOutside, ...props }, ref) => {
  const leftSheet = variant === "leftSheet";
  const rightSheet = variant === "rightSheet";
  const sheet = leftSheet || rightSheet;
  const showOverlay = overlay !== "none";
  const innerRef = React.useRef<React.ElementRef<typeof DialogPrimitive.Content>>(null);
  /** 自己的遮罩。判定「点的是不是别的弹层」时要把它摘出去，否则自己点自己遮罩关不掉。 */
  const overlayRef = React.useRef<HTMLDivElement>(null);
  /** 同时喂给 forwarded ref 与内部 ref —— 判定「是不是点了别的弹层」要用到自己的 DOM。 */
  const setContentRef = (node: React.ElementRef<typeof DialogPrimitive.Content> | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) {
      (ref as React.MutableRefObject<React.ElementRef<typeof DialogPrimitive.Content> | null>).current = node;
    }
  };
  const blockOutsideDismiss = (event: Event) => {
    if (!closeOnOverlayClick) {
      event.preventDefault();
      return;
    }
    // 事件来自**另一层**弹层时，不算「点了外面」。手写/portal 到 body 的弹层
    // （appConfirm / appAlert / appPrompt，都带 data-modal-layer）Radix 不认识，
    // 点它上面的按钮会被判成外部交互 —— 表现是「在设置弹窗里点确认框的『确定』，
    // 设置弹窗跟着被卸载」。这是通用层的问题，任何 Radix 弹窗 + appConfirm 都会中。
    //
    // 嵌套的 Radix 弹窗同理：内层遮罩也带 data-modal-layer，所以点内层遮罩只关内层，
    // 外层不受影响；自己的遮罩要排除掉，否则连自己都关不掉了。
    const detail = (event as CustomEvent<{ originalEvent?: Event }>).detail;
    const target = (detail?.originalEvent?.target ?? event.target) as HTMLElement | null;
    const layer = target?.closest?.('[data-modal-layer="true"]');
    if (layer && layer !== innerRef.current && layer !== overlayRef.current) event.preventDefault();
  };
  return (
    <DialogPortal>
      {showOverlay ? (
        alwaysShowOverlay ? (
          <div
            ref={overlayRef}
            data-modal-layer="true"
            className={cn(
              "fixed inset-0 z-[var(--z-overlay)] bg-black/50",
              overlayClassName
            )}
            aria-hidden
          />
        ) : (
          <DialogOverlay
            ref={overlayRef}
            className={cn(
              sheet ? "z-[var(--z-overlay)]" : undefined,
              overlayClassName
            )}
          />
        )
      ) : null}
      <DialogPrimitive.Content
        ref={setContentRef}
        data-modal-layer="true"
        onInteractOutside={(event) => {
          blockOutsideDismiss(event);
          onInteractOutside?.(event);
        }}
        onPointerDownOutside={(event) => {
          blockOutsideDismiss(event);
          onPointerDownOutside?.(event);
        }}
        onFocusOutside={(event) => {
          blockOutsideDismiss(event);
          onFocusOutside?.(event);
        }}
        className={cn(
          sheet && "overflow-hidden",
          leftSheet
            ? "fixed inset-y-0 left-0 z-[var(--z-modal)] flex h-full w-[min(24rem,92vw)] max-w-[min(24rem,92vw)] translate-x-0 translate-y-0 flex-col gap-0 border-y-0 border-l-0 border-r border-slate-200 bg-white p-0 text-slate-900 shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-200"
            : rightSheet
              ? "fixed inset-y-0 right-0 z-[var(--z-modal)] flex h-full w-[min(28rem,96vw)] max-w-[min(32rem,96vw)] translate-x-0 translate-y-0 flex-col gap-0 border-y-0 border-r-0 border-l border-slate-200 bg-white p-0 text-slate-900 shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200"
            : "fixed left-[50%] top-[50%] z-[var(--z-modal)] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-200 bg-white p-6 text-slate-900 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className
        )}
        {...props}
      >
      {children}
      {showClose ? (
        <DialogPrimitive.Close className={cn(
          "absolute rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-slate-100 data-[state=open]:text-slate-600",
          sheet ? "right-3 top-3" : "right-4 top-4"
        )}>
          <X className="h-4 w-4" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
