import { useRef, useState } from 'react';
import { ScanFace, Loader2 } from 'lucide-react';
import { searchPersonnel } from '@/api/domains/profile.api';
import { useAnalyzeScanMutation, useExecuteAccessMutation } from '@/api/hooks/useScanner';
import type { AnalyzeResponse } from '@/api/types/scanner';
import { UiverseProfilePopup } from './UiverseProfilePopup';
import { AnimatePresence } from 'framer-motion';

const toHalfWidth = (value: string) =>
    value.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, " ");

export default function ScannerPanel() {

    console.log("🔥 测谎仪：当前渲染的 ScannerPanel 是我刚刚修改的这个版本！");

    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [executeErrorMessage, setExecuteErrorMessage] = useState('');
    const [lastScannedId, setLastScannedId] = useState('');

    // 中文转 ID 期间的专属加载状态
    const [isSearchingName, setIsSearchingName] = useState(false);
    const [isComposing, setIsComposing] = useState(false);

    const [activeResult, setActiveResult] = useState<AnalyzeResponse | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetCloseTimer = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setInputValue('');
            setLastScannedId('');
            setActiveResult(null);
            setExecuteErrorMessage('');
            analyzeMutation.reset();
            executeMutation.reset();
        }, 120000);
    };

    const analyzeMutation = useAnalyzeScanMutation({
        onSuccess: (data) => {
            setActiveResult(data);
            setExecuteErrorMessage('');
            resetCloseTimer();
        },
        onError: (error) => setErrorMsg(error.message || '无法解析该人员')
    });

    const executeMutation = useExecuteAccessMutation({
        onSuccess: (data) => {
            const failedMessage = data.success === false ? (data.message || data.msg || '操作被拒绝') : '';
            setExecuteErrorMessage(failedMessage);
            if (failedMessage) {
                setErrorMsg(failedMessage);
                return;
            }
            resetCloseTimer();
        },
        onError: (error) => {
            const message = error.message || '操作被拒绝';
            setErrorMsg(message);
            setExecuteErrorMessage(message);
        }
    });

    // =========================================================
    // 💥 核心 1：剥离出绝对纯净的“标准物理扫码扳机”
    // =========================================================
    const triggerStandardScan = (hardwareId: string) => {
        setLastScannedId(hardwareId);
        analyzeMutation.mutate(hardwareId || 'RANDOM');
    };

    // =========================================================
    // 💥 核心 2：带“暴力弹窗探针”的拦截器
    // =========================================================
    const handleScan = async () => {
        const cleanValue = toHalfWidth(String(inputValue)).trim();
        if (!cleanValue) return;

        setErrorMsg('');
        setExecuteErrorMessage('');
        executeMutation.reset();

        const hasChinese = /[\u4e00-\u9fa5]/.test(cleanValue);

        if (hasChinese) {
            try {
                setIsSearchingName(true);
                // 1. 发起请求
                const rawResponse = await searchPersonnel(cleanValue);

                // 2. 强力脱壳：不管后端怎么包，我们把真实的数组挖出来
                const personList = rawResponse;

                if (personList && personList.length > 0) {
                    const person = personList[0] as unknown as Record<string, string | undefined>;

                    // 💥💥💥 终极爆破弹窗：把这个人的所有底裤字段全扒出来给你看！
                    // 注意：当你看到这个弹窗时，仔细看里面代表 ID 的字段到底叫什么名字！
                    alert("🚨 数据库真实返回的字段长这样：\n\n" + JSON.stringify(person, null, 2));

                    // 💥 这里加上了更多你在实验室系统里可能用到的物理 ID 命名猜测
                    const realUserId = person.user_id
                        || person.userId
                        || person.id
                        || person.card_no    // 可能是物理卡号
                        || person.emp_no     // 可能是工号
                        || person.work_no
                        || person.person_id;

                    if (!realUserId) {
                        setErrorMsg(`未匹配到 ID！请看刚才的弹窗里，ID 字段到底叫啥？`);
                        return;
                    }

                    console.log(`✅ 解析成功！正在物理填入 ID: [${realUserId}] 并触发回车...`);

                    // 像硬件一样物理填入
                    setInputValue(toHalfWidth(String(realUserId)).toUpperCase());
                    // 触发扫码
                    triggerStandardScan(toHalfWidth(String(realUserId)).trim());

                } else {
                    setErrorMsg(`查无此人：档案库中未找到名为“${cleanValue}”的人员`);
                }
            } catch (error) {
                console.error("搜索名字崩溃:", error);
                setErrorMsg('检索人员姓名异常，请检查网络状态');
            } finally {
                setIsSearchingName(false);
            }
        } else {
            // 纯数字或字母，直接扫码
            const normalized = cleanValue.toUpperCase();
            setInputValue(normalized);
            triggerStandardScan(normalized);
        }
    };

    // 汇总加载状态，保护输入框防连点
    const isWorking = analyzeMutation.isPending || executeMutation.isPending || isSearchingName;

    return (
        <div className="h-full w-full flex flex-col relative">
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                paddingBottom: '10px',
                marginBottom: '10px'
            }} className="shrink-0">
                <div style={{
                    fontSize: '14px',
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#1d1d1f'
                }}>
                    <div style={{
                        width: '6px',
                        height: '6px',
                        background: '#ff3b30',
                        borderRadius: '50%',
                        boxShadow: '0 0 8px #ff3b30'
                    }}></div>
                    终端访问录入
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-full max-w-[220px] relative">
                    <ScanFace className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]"/>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(toHalfWidth(e.target.value))}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={(e) => {
                            setIsComposing(false);
                            setInputValue(toHalfWidth(e.currentTarget.value));
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isComposing && !e.nativeEvent.isComposing) {
                                void handleScan();
                            }
                        }}
                        placeholder="键入 ID/名字或刷卡..."
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="text"
                        lang="en"
                        className="w-full bg-[#f8f9fa] border border-[#dcdfe6] rounded-[10px] pl-9 pr-4 py-2.5 font-mono text-[13px] text-[#1d1d1f] focus:bg-white focus:border-[#2d5cf7] focus:shadow-[0_0_0_3px_rgba(45,92,247,0.1)] outline-none transition-all"
                        disabled={isWorking}
                    />
                    {(analyzeMutation.isPending || isSearchingName) && (
                        <Loader2
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2d5cf7] animate-spin"/>
                    )}
                </div>
                {errorMsg && (
                    <div className="mt-4 text-[12px] font-bold text-[#ff3b30] bg-[#ff3b30]/10 px-3 py-1.5 rounded-lg text-center">
                        {errorMsg}
                    </div>
                )}
            </div>

            <AnimatePresence>
                {activeResult && (
                    <UiverseProfilePopup
                        result={activeResult}
                        onClose={() => {
                            setActiveResult(null);
                            setExecuteErrorMessage('');
                            analyzeMutation.reset();
                            executeMutation.reset();
                            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                        }}
                        onExecute={(payload) => executeMutation.mutate(payload)}
                        isWorking={executeMutation.isPending}
                        executeData={executeMutation.data}
                        executeErrorMessage={executeErrorMessage}

                        isRefreshing={analyzeMutation.isPending}
                        onRefresh={() => lastScannedId && analyzeMutation.mutate(lastScannedId)}
                        onExecuteReset={() => executeMutation.reset()}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}