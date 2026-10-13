package com.example.demo.modules.twin.common.util;

import net.sourceforge.pinyin4j.PinyinHelper;
import net.sourceforge.pinyin4j.format.HanyuPinyinCaseType;
import net.sourceforge.pinyin4j.format.HanyuPinyinOutputFormat;
import net.sourceforge.pinyin4j.format.HanyuPinyinToneType;
import net.sourceforge.pinyin4j.format.exception.BadHanyuPinyinOutputFormatCombination;

import java.util.ArrayList;
import java.util.List;

/**
 * 中文姓名的「像不像」—— 用户把名字打错一个字时用的判据。
 *
 * <p>打错字最常见的就是打了**同音字**（「王毓斐」打成「王毓菲」、「郑俊克」打成「郑均克」），
 * 只按字面比对时这种错会掉到「只共用一个姓」，于是查无此人。
 *
 * <p>所以判据是：长度差不超过一个字、**至少对上两个字**、且这两个字覆盖到几乎整个名字；
 * **每个字按「同字」优先、「同音」次之**匹配（同字计分更高，字面相同的自然排在最前）。
 * 全谐音（一个字都不同、但念起来一样）照样算 —— 见 {@link #score} 里的说明。
 *
 * <p><b>为什么非要「至少对上两个字」</b>（这条是 2026-10-13 用户反馈后想明白的）：
 * 三字名「郑均克」只对上「郑」一个字时，如果放行，回给用户的就是「郑杰」「郑铨」这类
 * **只共一个姓的两字名** —— 用户的原话是「我是三个音节，问我两个音节的」，纯属噪音。
 * 靠长度 + 覆盖度这两条把噪音挡在外面，比要求「必须有同字」更准。
 *
 * <p>用它的两处：免冻包（人名 → 卡）、课题组搜索与申领审计的候选收窄（组名的 PI 前缀 / 人名）。
 */
public final class ChineseNameSimilarity {

    private ChineseNameSimilarity() {
    }

    /** 拼音格式：不要声调、全小写 —— 「菲 fēi」与「斐 fěi」才算同音。 */
    private static final HanyuPinyinOutputFormat PY_FORMAT = pinyinFormat();

    private static HanyuPinyinOutputFormat pinyinFormat() {
        HanyuPinyinOutputFormat f = new HanyuPinyinOutputFormat();
        f.setToneType(HanyuPinyinToneType.WITHOUT_TONE);
        f.setCaseType(HanyuPinyinCaseType.LOWERCASE);
        return f;
    }

    /** 两个字是不是**同音**：相同，或拼音（去声调）一致。 */
    public static boolean sameSound(char x, char y) {
        if (x == y) {
            return true;
        }
        try {
            String[] px = PinyinHelper.toHanyuPinyinStringArray(x, PY_FORMAT);
            String[] py = PinyinHelper.toHanyuPinyinStringArray(y, PY_FORMAT);
            if (px == null || py == null) {
                return false;
            }
            for (String a : px) {
                for (String b : py) {
                    if (a.equals(b)) {
                        return true;
                    }
                }
            }
        } catch (BadHanyuPinyinOutputFormatCombination e) {
            // 格式是写死的合法组合，走不到这里；真走到了当不同音，不影响主流程
        }
        return false;
    }

    /**
     * 两个姓名「有多像」：0 = 不像，越大越像（候选按它排序，最像的排第一）。
     *
     * @see ChineseNameSimilarity 类注释里的判据与「为什么至少要对上两个字」
     */
    public static int score(String a, String b) {
        if (a == null || b == null || a.isEmpty() || b.isEmpty()
                || Math.abs(a.length() - b.length()) > 1) {
            return 0;
        }
        List<Character> pool = new ArrayList<>();
        for (char c : b.toCharArray()) {
            pool.add(c);
        }
        int exact = 0;
        int sound = 0;
        for (char c : a.toCharArray()) {
            int at = -1;
            for (int i = 0; i < pool.size(); i++) {
                if (pool.get(i) == c) {
                    at = i;
                    break;
                }
            }
            if (at >= 0) {
                exact++;
                pool.remove(at);
                continue;
            }
            for (int i = 0; i < pool.size(); i++) {
                if (sameSound(pool.get(i), c)) {
                    at = i;
                    break;
                }
            }
            if (at >= 0) {
                sound++;
                pool.remove(at);
            }
        }
        int hit = exact + sound;
        /*
         * 判据：长度差不超过一个字、**至少对上两个字**、且这两个字覆盖到几乎整个名字。
         *
         * <p><b>不再要求「至少有一个字完全相同」</b>（2026-10-13 用户点名）：**全谐音的名字生活里很常见**
         * ——「张军」被写成「章钧」、「李娜」被写成「李纳」，三个字全对不上但念起来一模一样。
         * 要求同字就把这类整片漏掉，而它恰恰是谐音识别最该管住的一类。
         *
         * <p>放开的代价（同音字极多）由另外两条压住：**至少对上两个字**、且**hit 要覆盖到较短那个名字的
         * 长度减一** —— 两个字的名字必须两个字全对上（音或字都算），一个字对不上就出局。
         * 同字比同音可信，所以计分上同字（×10）压过同音（×6），排序时字面相同的仍在最前。
         */
        if (hit < 2 || hit < Math.min(a.length(), b.length()) - 1) {
            return 0;
        }
        return exact * 10 + sound * 6 + (a.length() == b.length() ? 1 : 0);
    }
}
