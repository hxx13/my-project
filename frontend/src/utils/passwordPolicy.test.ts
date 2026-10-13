import { describe, expect, it } from "vitest";
import {
    PASSWORD_MIN_LENGTH,
    countPasswordCategories,
    passwordCategoriesMet,
    validatePassword,
} from "./passwordPolicy";

/**
 * 这份单测的意义：规则以前散落在各处、而且写错了（都写「至少 6 位」），
 * 用后端的真实口径把它钉住 —— 一旦有人把长度或类别数改回去，这里立刻红。
 */
describe("validatePassword", () => {
    it("长度不足 8 位被拒（不是 6 位）", () => {
        expect(validatePassword("Ab1!")).toBe("密码长度不能少于8位");
        expect(validatePassword("Abc123!")).toBe("密码长度不能少于8位");
        expect(PASSWORD_MIN_LENGTH).toBe(8);
    });

    it("8 位且凑够三类才算过", () => {
        expect(validatePassword("Abcdef1!")).toBeNull(); // 大写+小写+数字+特殊 = 4 类
        expect(validatePassword("Abcdefgh")).toBe("密码需至少包含大写字母、小写字母、数字、特殊字符中的三类");
        expect(validatePassword("abcdefg1")).toBe("密码需至少包含大写字母、小写字母、数字、特殊字符中的三类");
    });

    it("恰好三类即可，不要求四类都有", () => {
        expect(validatePassword("abcdefG1")).toBeNull(); // 小写+大写+数字 = 3 类
        expect(validatePassword("abcdef1!")).toBeNull(); // 小写+数字+特殊 = 3 类
        expect(validatePassword("ABCDEF1!")).toBeNull(); // 大写+数字+特殊 = 3 类
    });

    it("只有两类一律拒绝", () => {
        expect(validatePassword("abcdefgh")).not.toBeNull();
        expect(validatePassword("ABCDEFGH")).not.toBeNull();
        expect(validatePassword("12345678")).not.toBeNull();
        expect(validatePassword("!@#$%^&*")).not.toBeNull();
        expect(validatePassword("abcdEFGH")).not.toBeNull();
    });

    it("空值与纯空白被拒", () => {
        expect(validatePassword("")).toBe("密码不能为空");
        expect(validatePassword("        ")).toBe("密码不能为空");
    });

    it("先 trim 再判，与后端一致", () => {
        // 尾部空格不该把 8 位「凑」出来
        expect(validatePassword("Abcdef1!   ")).toBeNull(); // trim 后仍是 8 位合法
        expect(validatePassword("Abcdef1    ")).toBe("密码长度不能少于8位"); // trim 后 7 位
    });

    it("超过 64 位被拒", () => {
        expect(validatePassword("Abcdef1!" + "x".repeat(56))).toBeNull(); // 正好 64 位
        expect(validatePassword("Abcdef1!" + "x".repeat(57))).toBe("密码长度不能超过64位");
    });
});

describe("passwordCategoriesMet", () => {
    it("四类各自识别，空白不算特殊字符", () => {
        expect(passwordCategoriesMet("aA1!")).toEqual({
            lowercase: true,
            uppercase: true,
            digit: true,
            special: true,
        });
        expect(passwordCategoriesMet("aA1 ")).toEqual({
            lowercase: true,
            uppercase: true,
            digit: true,
            special: false,
        });
    });

    it("类别计数用于「至少三类」的判定", () => {
        expect(countPasswordCategories("abcdefgh")).toBe(1);
        expect(countPasswordCategories("abcDEFgh")).toBe(2);
        expect(countPasswordCategories("abcDEF1h")).toBe(3);
        expect(countPasswordCategories("abcDEF1!")).toBe(4);
    });
});
