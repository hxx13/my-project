export interface ApiResponse<T> {
    code: number;
    success: boolean;
    message?: string;
    msg?: string;
    data: T;
}

type MaybeWrapped<T> = T | ApiResponse<T> | { data?: T } | null | undefined;

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
}

export type Primitive = string | number | boolean;

export type QueryParamValue = Primitive | Primitive[] | undefined | null;

export type QueryParams = Record<string, QueryParamValue>;

export const unwrapData = <T>(payload: MaybeWrapped<T>, fallback: T): T => {
    if (payload && typeof payload === "object" && "data" in payload) {
        const wrapped = payload as { data?: T };
        return wrapped.data ?? fallback;
    }
    return (payload as T) ?? fallback;
};

export const unwrapList = <T>(payload: MaybeWrapped<T[] | unknown>, fallback: T[] = []): T[] => {
    const value = unwrapData(payload, fallback as T[] | unknown);
    return Array.isArray(value) ? (value as T[]) : fallback;
};

export const unwrapObject = <T extends Record<string, unknown>>(
    payload: MaybeWrapped<T | unknown>,
    fallback: T
): T => {
    const value = unwrapData(payload, fallback as T | unknown);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : fallback;
};
