export interface ScentMark {
  id: string;
  text: string;
  name: string | null;
  createdAt: string;
}

export interface ScentMarksListResponse {
  ok: boolean;
  marks: ScentMark[];
  message?: string;
}

const ADMIN_TOKEN_KEY = "m-e621-scent-admin";

export const getScentAdminPassword = (): string | null => {
  const saved = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  return saved?.trim() ? saved.trim() : null;
};

export const setScentAdminPassword = (password: string) => {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, password.trim());
};

export const clearScentAdminPassword = () => {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string };
    if (data.message) return data.message;
  } catch {
    // ignore
  }
  return `HTTP ${res.status}`;
}

export async function listScentMarks(): Promise<ScentMark[]> {
  const res = await fetch("/api/scent-marks", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as ScentMarksListResponse;
  return Array.isArray(data.marks) ? data.marks : [];
}

export async function createScentMark(args: {
  text: string;
  name?: string;
}): Promise<ScentMark> {
  const res = await fetch("/api/scent-marks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: args.text,
      ...(args.name?.trim() ? { name: args.name.trim() } : {}),
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { mark?: ScentMark; message?: string };
  if (!data.mark) throw new Error(data.message || "create failed");
  return data.mark;
}

export async function deleteScentMark(
  id: string,
  password: string,
): Promise<void> {
  const res = await fetch(`/api/scent-marks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${password}`,
      "X-Scent-Admin": password,
    },
  });
  if (!res.ok) throw new Error(await readError(res));
}
