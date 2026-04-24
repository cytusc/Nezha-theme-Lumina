import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/services/api";

const AUTH_CACHE_KEY = "lumina.auth.v1";
const AUTH_CACHE_TTL_MS = 5 * 60_000;

function readCachedAuth() {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      data: Awaited<ReturnType<typeof getMe>>;
      updatedAt: number;
    };
    if (!parsed || typeof parsed.updatedAt !== "number") return undefined;
    if (Date.now() - parsed.updatedAt > AUTH_CACHE_TTL_MS) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function getMeWithCache() {
  const data = await getMe();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        AUTH_CACHE_KEY,
        JSON.stringify({
          data,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      // 忽略浏览器缓存写入失败。
    }
  }
  return data;
}

export function useAuth() {
  const cached = readCachedAuth();
  return useQuery({
    queryKey: ["me"],
    queryFn: getMeWithCache,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
  });
}
