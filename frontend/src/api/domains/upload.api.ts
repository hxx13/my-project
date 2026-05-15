import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export async function uploadSingleImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await authHttp.post<Result<{ url: string }>>("/upload", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data.data.url;
}
