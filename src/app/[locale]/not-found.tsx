import { getTranslations } from "next-intl/server";
import { NotFoundGoHomeButton } from "@/components/NotFoundGoHomeButton";

export default async function NotFound() {
  const t = await getTranslations("app.notFound");

  return (
    <div className="ds-auth-shell flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <p className="text-sm font-semibold tracking-wide text-primary-600">
          404
        </p>
        <h1 className="ds-page-title mt-2">{t("title")}</h1>
        <p className="ds-subtitle mx-auto mt-3 max-w-md">{t("description")}</p>
      </div>
      <NotFoundGoHomeButton />
    </div>
  );
}
