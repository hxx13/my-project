import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { UiverseSearchInput } from "@/components/ui/UiverseSearchInput";
import { searchPersonnel } from "@/api/twinApi";
import { Loader2, User, X, Phone, Shield, Building, Award, Zap } from "lucide-react";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";

export function PersonnelSearchDropdown() {
    const [keyword, setKeyword] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!keyword.trim()) {
            setResults([]); setIsOpen(false); return;
        }
        const timer = setTimeout(() => { executeSearch(keyword.trim()); }, 300);
        return () => clearTimeout(timer);
    }, [keyword]);

    const executeSearch = async (val: string) => {
        setIsSearching(true);
        setIsOpen(true);
        try {
            const data = await searchPersonnel(val);
            setResults(data || []);
        } catch (error) {
            console.error("人员搜索失败:", error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleFocus = () => {
        if (keyword.trim()) {
            setIsOpen(true);
            if (results.length === 0) executeSearch(keyword.trim());
        }
    };

    // 💥 终极暴力字段提取器：无视大小写、无视下划线！
    const extractValue = (obj: any, possibleKeys: string[]) => {
        if (!obj) return null;
        const normalizedObjKeys = Object.keys(obj).map(k => ({ original: k, normalized: k.toLowerCase().replace(/_/g, '') }));

        for (const target of possibleKeys) {
            const normalizedTarget = target.toLowerCase().replace(/_/g, '');
            const match = normalizedObjKeys.find(k => k.normalized === normalizedTarget);

            if (match) {
                const val = obj[match.original];
                // 剔除空字符串和伪装成字符串的 "null"
                if (val !== null && val !== undefined && val !== '' && String(val).trim().toLowerCase() !== 'null') {
                    return val;
                }
            }
        }
        return null;
    };

    // 💥 绝对安全的数据加工厂
    const getSafeData = (person: any) => {
        if (!person) return null;

        // 👁️ 开启真理之眼！在控制台打印后端吐出的原始数据
        console.log("🕵️ 后端传给前端的原始单条人员数据:", person);

        const userId = extractValue(person, ['userid', 'user_id', 'id']) || '';
        const phone = extractValue(person, ['mobilephone', 'mobile_phone', 'phone']) || '';

        // 暴力遍历所有课题组可能的变体
        const rawGroup = extractValue(person, ['projectgroupname', 'projectgroupnames', 'groupname']);
        const exp = extractValue(person, ['totalexp', 'total_exp', 'exp']) || 0;

        return {
            name: extractValue(person, ['name', 'username']) || '未知',
            head: extractValue(person, ['head', 'avatar']),
            gender: extractValue(person, ['gender', 'sex']),
            userId: userId,
            // 如果暴力提取后还是 null，说明数据库里真的是空！
            groupName: rawGroup || '无课题组',
            deptName: extractValue(person, ['departmentname', 'department_name']) || '-',
            roleName: extractValue(person, ['usertypenames', 'user_type_names', 'usertypename', 'role']) || '-',
            phone: phone,
            displayPhone: phone || (userId.length >= 11 ? userId.substring(0, 11) : userId),
            exp: exp,
            level: Math.floor(Math.sqrt(Number(exp) / 50.0)) + 1
        };
    };

    const safeSelected = getSafeData(selectedPerson);
    const selectedAvatarSrc = safeSelected ? resolvePersonnelAvatarUrl(safeSelected.head) : undefined;

    return (
        <>
            <div className="relative z-[50]" ref={wrapperRef}>
                <div className="w-[40px] h-[40px] relative">
                    <UiverseSearchInput
                        placeholder="搜姓名、电话、课题组..."
                        onInputChange={setKeyword}
                        onActionExecute={executeSearch}
                        onFocus={handleFocus}
                    />
                </div>

                {isOpen && keyword && (
                    <div className="absolute top-[50px] right-0 w-[240px] bg-[#191A1E]/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.6)] rounded-[16px] overflow-hidden z-[9999] flex flex-col transition-all animate-in fade-in slide-in-from-top-2">
                        {isSearching && <div className="p-4 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>}
                        {!isSearching && results.length === 0 && <div className="p-4 text-center text-xs font-bold text-slate-400">查无此人</div>}

                        {!isSearching && results.length > 0 && (
                            <div className="max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:hidden p-2">
                                {results.map((rawPerson: any) => {
                                    const p = getSafeData(rawPerson)!;

                                    const headSrc = resolvePersonnelAvatarUrl(p.head);
                                    return (
                                        <div
                                            key={p.userId}
                                            className="flex items-center gap-3 p-2 rounded-[12px] hover:bg-white/10 cursor-pointer transition-colors"
                                            onClick={() => {
                                                setSelectedPerson(rawPerson);
                                                setIsOpen(false);
                                            }}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-black/50 overflow-hidden flex justify-center items-center shrink-0 border border-white/5">
                                                {headSrc ? <img src={headSrc} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-500" />}
                                            </div>
                                            <div className="flex-1 overflow-hidden flex flex-col justify-center">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[13px] font-bold text-white truncate leading-tight">{p.name}</span>
                                                    <span className="text-[10px] font-black text-[#2d5cf7] bg-[#2d5cf7]/10 px-1.5 py-0.5 rounded font-mono shrink-0">
                                                        Lv.{p.level}
                                                    </span>
                                                </div>
                                                <span className="text-[11px] text-slate-400 font-medium truncate mt-0.5">🧬 {p.groupName}</span>

                                                <span className="text-[10px] font-mono text-slate-500 truncate mt-0.5 flex items-center gap-1">
                                                    📞 {p.displayPhone}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* RPG 全息角色档案卡 (Portal 弹窗) */}
            {safeSelected && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#050A15]/70 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-[24px] w-[380px] shadow-2xl relative overflow-hidden animate-in zoom-in-95">
                        <div className="h-24 bg-gradient-to-r from-[#191A1E] to-[#2d5cf7] relative">
                            <button onClick={() => setSelectedPerson(null)} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors bg-black/20 p-1.5 rounded-full backdrop-blur-sm">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 pb-6 relative flex flex-col items-center">
                            <div className="w-24 h-24 rounded-full border-4 border-white shadow-xl bg-white absolute -top-12 flex items-center justify-center overflow-hidden">
                                {selectedAvatarSrc ? <img src={selectedAvatarSrc} className="w-full h-full object-cover" /> : <User className="w-12 h-12 text-slate-300"/>}
                            </div>
                            <div className="mt-14 flex flex-col items-center w-full">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">{safeSelected.name}</h2>
                                    {safeSelected.gender && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${safeSelected.gender === '男' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>{safeSelected.gender}</span>}
                                </div>
                                <p className="font-mono text-slate-400 text-xs mt-1 mb-4 tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                                    ID: {safeSelected.userId}
                                </p>
                                <div className="w-full bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-inner">
                                            <Zap className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 font-bold">实验室探索者</div>
                                            <div className="text-lg font-black text-slate-800">Lv.{safeSelected.level}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Exp</div>
                                        <div className="font-mono font-black text-blue-600 text-lg">{safeSelected.exp.toFixed(1)}</div>
                                    </div>
                                </div>
                                <div className="w-full space-y-3 text-sm">
                                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                        <div className="flex items-center gap-2 text-slate-400 font-bold"><Phone className="w-4 h-4" /> 联系电话</div>
                                        <span className="font-mono font-bold text-slate-700">{safeSelected.phone || '未留存'}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                        <div className="flex items-center gap-2 text-slate-400 font-bold"><Shield className="w-4 h-4" /> 身份角色</div>
                                        <span className="font-black text-slate-700 bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs truncate max-w-[150px]">{safeSelected.roleName}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                        <div className="flex items-center gap-2 text-slate-400 font-bold"><Building className="w-4 h-4" /> 所属部门</div>
                                        <span className="font-bold text-slate-700 text-xs truncate max-w-[150px]">{safeSelected.deptName}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1">
                                        <div className="flex items-center gap-2 text-slate-400 font-bold"><Award className="w-4 h-4" /> 课题组</div>
                                        <span className="font-bold text-slate-700 text-xs truncate max-w-[150px]">{safeSelected.groupName}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}