import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { NodeGrid } from "@/components/node/NodeGrid";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";

const ThemeManage = lazy(() =>
  import("@/pages/ThemeManage").then((module) => ({ default: module.ThemeManage })),
);

export function Home() {
  const [searchParams] = useSearchParams();
  const { data: me, isLoading: authLoading, isFetching: authFetching } = useAuth();
  const isThemeManageView = searchParams.get("view") === "theme-manage";

  if (isThemeManageView) {
    if (authLoading || authFetching) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner size={24} />
        </div>
      );
    }
    if (!me?.logged_in) {
      return <Navigate to="/" replace />;
    }
    return (
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <Spinner size={24} />
          </div>
        }
      >
        <ThemeManage />
      </Suspense>
    );
  }

  return (
    <div className="py-2">
      <NodeGrid />
    </div>
  );
}
