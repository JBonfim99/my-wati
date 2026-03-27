"use client";

import { useTranslations } from "next-intl";
import {
  Camera,
  ChevronLeft,
  ExternalLink,
  ImageIcon,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Reply,
  Smile,
} from "lucide-react";
import type { TemplatePreviewModel } from "@/lib/meta/template-preview-model";
import { WhatsAppMdPreview } from "./WhatsAppMdPreview";

type Props = {
  model: TemplatePreviewModel;
  businessName?: string;
};

function StatusBarIcons() {
  return (
    <div
      className="flex items-center gap-1 text-[#353735]"
      aria-hidden
    >
      <svg width={13} height={10} viewBox="0 0 11 7" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M9.40837 0.793945C9.13355 0.793945 8.91077 1.01673 8.91077 1.29154V6.43338C8.91077 6.70819 9.13355 6.93097 9.40837 6.93097H10.0718C10.3466 6.93097 10.5694 6.70819 10.5694 6.43338V1.29154C10.5694 1.01673 10.3466 0.793945 10.0718 0.793945H9.40837Z"
          fill="currentColor"
        />
        <path
          d="M6.25692 2.61847C6.25692 2.34365 6.4797 2.12087 6.75452 2.12087H7.41798C7.69279 2.12087 7.91557 2.34365 7.91557 2.61847V6.43338C7.91557 6.70819 7.69279 6.93097 7.41798 6.93097H6.75451C6.4797 6.93097 6.25692 6.70819 6.25692 6.43338V2.61847Z"
          fill="currentColor"
        />
        <path
          d="M4.10067 3.4478C3.82585 3.4478 3.60307 3.67058 3.60307 3.94539V6.43338C3.60307 6.70819 3.82585 6.93097 4.10066 6.93097H4.76413C5.03894 6.93097 5.26172 6.70819 5.26172 6.43338V3.94539C5.26172 3.67058 5.03894 3.4478 4.76413 3.4478H4.10067Z"
          fill="currentColor"
        />
        <path
          d="M1.44682 4.60885C1.172 4.60885 0.949219 4.83164 0.949219 5.10645V6.43338C0.949219 6.70819 1.172 6.93097 1.44682 6.93097H2.11028C2.38509 6.93097 2.60787 6.70819 2.60787 6.43338V5.10645C2.60787 4.83164 2.38509 4.60885 2.11028 4.60885H1.44682Z"
          fill="currentColor"
        />
      </svg>
      <svg width={12} height={9} viewBox="0 0 9 7" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.45637 2.0685C5.68372 2.06855 6.86414 2.54508 7.75365 3.39958C7.82063 3.46555 7.92769 3.46472 7.99366 3.39771L8.63396 2.74476C8.66736 2.71078 8.68598 2.66475 8.68571 2.61685C8.68543 2.56895 8.66627 2.52314 8.63248 2.48956C6.2978 0.228742 2.61457 0.228742 0.279886 2.48956C0.246067 2.52312 0.226878 2.56891 0.226566 2.61681C0.226255 2.66471 0.244845 2.71076 0.278225 2.74476L0.918701 3.39771C0.984629 3.46482 1.09178 3.46565 1.15872 3.39958C2.04834 2.54502 3.2289 2.06849 4.45637 2.0685ZM4.45638 4.19278C5.13073 4.19274 5.78101 4.44601 6.28088 4.90337C6.34849 4.96828 6.45499 4.96688 6.5209 4.9002L7.16045 4.24725C7.19413 4.213 7.21282 4.16654 7.21233 4.11826C7.21185 4.06998 7.19223 4.02391 7.15786 3.99036C5.63568 2.55963 3.27838 2.55963 1.75619 3.99036C1.7218 4.02391 1.70219 4.07001 1.70174 4.1183C1.70128 4.1666 1.72004 4.21305 1.75379 4.24725L2.39316 4.9002C2.45906 4.96688 2.56556 4.96828 2.63317 4.90337C3.13271 4.44631 3.78248 4.19306 4.45638 4.19278ZM5.7375 5.62201C5.73848 5.67042 5.71964 5.7171 5.68544 5.75102L4.57915 6.87913C4.54672 6.91228 4.5025 6.93094 4.45637 6.93094C4.41023 6.93094 4.36602 6.91228 4.33359 6.87913L3.22711 5.75102C3.19293 5.71708 3.17413 5.67038 3.17514 5.62197C3.17615 5.57355 3.19689 5.52771 3.23247 5.49525C3.93899 4.89143 4.97375 4.89143 5.68027 5.49525C5.71582 5.52773 5.73652 5.57359 5.7375 5.62201Z"
          fill="currentColor"
        />
      </svg>
      <svg width={17} height={10} viewBox="0 0 14 8" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M0.545395 1.46718C0.344727 1.86101 0.344727 2.37657 0.344727 3.40768V4.31829C0.344727 5.34941 0.344727 5.86496 0.545395 6.2588C0.721909 6.60523 1.00356 6.88688 1.34999 7.06339C1.74382 7.26406 2.25938 7.26406 3.2905 7.26406H9.83887C10.87 7.26406 11.3856 7.26406 11.7794 7.06339C12.1258 6.88688 12.4075 6.60523 12.584 6.2588C12.7846 5.86496 12.7846 5.34941 12.7846 4.31829V3.40769C12.7846 2.37657 12.7846 1.86101 12.584 1.46718C12.4075 1.12075 12.1258 0.839096 11.7794 0.662583C11.3856 0.461914 10.87 0.461914 9.83887 0.461914H3.2905C2.25938 0.461914 1.74382 0.461914 1.34999 0.662583C1.00356 0.839096 0.721909 1.12075 0.545395 1.46718ZM13.9475 3.86291C13.9475 4.36841 13.6816 4.81181 13.2821 5.06089V2.66493C13.6816 2.91402 13.9475 3.35741 13.9475 3.86291Z"
          fill="currentColor"
        />
        <path
          d="M3.78984 1.82523V5.52637H3.11937V2.47763H3.09768L2.23204 3.03063V2.41619L3.1519 1.82523H3.78984ZM6.09762 5.59685C5.80004 5.59685 5.54462 5.52155 5.33137 5.37095C5.11933 5.21914 4.95608 5.00047 4.84162 4.71494C4.72837 4.4282 4.67175 4.08302 4.67175 3.67941C4.67295 3.27581 4.73018 2.93244 4.84343 2.64931C4.95789 2.36498 5.12114 2.14812 5.33318 1.99872C5.54643 1.84933 5.80124 1.77463 6.09762 1.77463C6.394 1.77463 6.64882 1.84933 6.86207 1.99872C7.07532 2.14812 7.23857 2.36498 7.35182 2.64931C7.46627 2.93365 7.5235 3.27701 7.5235 3.67941C7.5235 4.08423 7.46627 4.43 7.35182 4.71674C7.23857 5.00228 7.07532 5.22035 6.86207 5.37095C6.65002 5.52155 6.39521 5.59685 6.09762 5.59685ZM6.09762 5.0312C6.32894 5.0312 6.51147 4.91734 6.6452 4.68964C6.78014 4.46073 6.84761 4.12398 6.84761 3.67941C6.84761 3.38544 6.81689 3.13846 6.75544 2.93847C6.694 2.73847 6.60725 2.58787 6.49521 2.48667C6.38316 2.38426 6.25063 2.33306 6.09762 2.33306C5.86751 2.33306 5.68558 2.44751 5.55185 2.67642C5.41812 2.90413 5.35065 3.23846 5.34945 3.67941C5.34824 3.97459 5.37776 4.22278 5.438 4.42398C5.49944 4.62518 5.58619 4.77698 5.69823 4.87939C5.81028 4.98059 5.94341 5.0312 6.09762 5.0312ZM9.49199 5.59685C9.1944 5.59685 8.93898 5.52155 8.72574 5.37095C8.51369 5.21914 8.35044 5.00047 8.23599 4.71494C8.12274 4.4282 8.06611 4.08302 8.06611 3.67941C8.06731 3.27581 8.12454 2.93244 8.23779 2.64931C8.35225 2.36498 8.5155 2.14812 8.72754 1.99872C8.94079 1.84933 9.19561 1.77463 9.49199 1.77463C9.78837 1.77463 10.0432 1.84933 10.2564 1.99872C10.4697 2.14812 10.6329 2.36498 10.7462 2.64931C10.8606 2.93365 10.9179 3.27701 10.9179 3.67941C10.9179 4.08423 10.8606 4.43 10.7462 4.71674C10.6329 5.00228 10.4697 5.22035 10.2564 5.37095C10.0444 5.52155 9.78957 5.59685 9.49199 5.59685ZM9.49199 5.0312C9.72331 5.0312 9.90583 4.91734 10.0396 4.68964C10.1745 4.46073 10.242 4.12398 10.242 3.67941C10.242 3.38544 10.2112 3.13846 10.1498 2.93847C10.0884 2.73847 10.0016 2.58787 9.88957 2.48667C9.77752 2.38426 9.64499 2.33306 9.49199 2.33306C9.26187 2.33306 9.07995 2.44751 8.94621 2.67642C8.81248 2.90413 8.74501 3.23846 8.74381 3.67941C8.7426 3.97459 8.77212 4.22278 8.83236 4.42398C8.8938 4.62518 8.98055 4.77698 9.0926 4.87939C9.20464 4.98059 9.33777 5.0312 9.49199 5.0312Z"
          fill="white"
        />
      </svg>
    </div>
  );
}

function MyWatiLogo() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="12" fill="white" />
      <path
        d="M7.99 17.66h5.64l3.37 3.37v-3.37h1.44c1.72 0 3.12-1.4 3.12-3.12v-4.44c0-1.72-1.4-3.12-3.12-3.12H7.99c-1.72 0-3.12 1.4-3.12 3.12v4.44c0 1.72 1.4 3.12 3.12 3.12Z"
        fill="#00E785"
      />
      <path
        d="M15.19 20.07 11.56 16.45H6.17C4.11 16.45 2.44 14.78 2.44 12.72V8.28C2.44 6.22 4.11 4.55 6.17 4.55h10.45c2.06 0 3.73 1.67 3.73 3.73v4.44c0 2.06-1.67 3.73-3.73 3.73h-1.44v-1.22h1.44c1.39 0 2.52-1.13 2.52-2.51V8.28c0-1.39-1.13-2.51-2.52-2.51H6.17C4.78 5.77 3.65 6.9 3.65 8.28v4.44c0 1.39 1.13 2.52 2.51 2.52h5.9l3.13 3.13-.01 1.7Z"
        fill="#1d1d1b"
      />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M9.93381 0.664076L10.0102 0.816641L10.5867 2.34962C10.632 2.47034 10.7272 2.5656 10.848 2.61089L12.328 3.16617C12.9775 3.40984 13.3266 4.10388 13.1535 4.76053L13.1118 4.89122L12.4233 6.41404C12.3699 6.53143 12.3699 6.66615 12.4233 6.78354L13.0772 8.22274C13.3642 8.85431 13.1202 9.59187 12.5335 9.93381L12.3809 10.0102L10.848 10.5867C10.7272 10.632 10.632 10.7272 10.5867 10.848L10.0314 12.328C9.78774 12.9775 9.0937 13.3266 8.43705 13.1535L8.30636 13.1118L6.78354 12.4233C6.66615 12.3699 6.53143 12.3699 6.41404 12.4233L4.97484 13.0772C4.34327 13.3642 3.60571 13.1202 3.26377 12.5335L3.18735 12.3809L2.61089 10.848C2.5656 10.7272 2.47034 10.632 2.34962 10.5867L0.869549 10.0314C0.220046 9.78774 -0.128977 9.0937 0.0440967 8.43705L0.0857385 8.30636L0.774305 6.78354C0.827644 6.66615 0.827644 6.53143 0.774305 6.41404L0.120374 4.97484C-0.166592 4.34327 0.0773694 3.60571 0.664076 3.26377L0.816641 3.18735L2.34962 2.61089C2.47034 2.5656 2.5656 2.47034 2.61089 2.34962L3.16617 0.869549C3.40984 0.220046 4.10388 -0.128977 4.76053 0.0440967L4.89122 0.0857385L6.41404 0.774305C6.53143 0.827644 6.66615 0.827644 6.78354 0.774305L8.22274 0.120374C8.85431 -0.166592 9.59187 0.0773694 9.93381 0.664076ZM8.76269 4.3047L5.57704 7.94544L4.41459 6.78299C4.24018 6.60858 3.9574 6.60858 3.78299 6.78299C3.60859 6.9574 3.60859 7.24018 3.78299 7.41459L5.28299 8.91459C5.46567 9.09726 5.76477 9.0873 5.93489 8.89288L9.43489 4.89288C9.59731 4.70726 9.5785 4.42511 9.39288 4.26269C9.20726 4.10027 8.92511 4.11908 8.76269 4.3047Z"
        fill="#017BFF"
      />
    </svg>
  );
}

function HeaderMediaPlaceholder({ label }: { label: string }) {
  return (
    <div className="mb-1 flex min-h-[120px] items-center justify-center rounded-lg border border-black/10 bg-zinc-100 text-xs text-zinc-500">
      <span className="flex items-center gap-1.5">
        <ImageIcon className="size-4 opacity-60" aria-hidden />
        {label}
      </span>
    </div>
  );
}

export function WhatsAppTemplatePhonePreview({ model, businessName = "my-wati" }: Props) {
  const t = useTranslations("app.templates");
  const now = new Date();
  const timeLabel = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const hasButtons = model.buttons.length > 0;
  const hasFooter = model.footer.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-[300px] shrink-0">
      <div className="overflow-hidden rounded-[2.25rem] border-[10px] border-zinc-900 bg-zinc-900 shadow-2xl">
        <div className="flex h-[640px] flex-col bg-[#efeae2]">
          {/* Status + chat bar */}
          <div className="shrink-0 bg-white">
            <div className="flex h-7 items-center justify-end px-3 pt-1">
              <StatusBarIcons />
            </div>
            <div className="flex h-12 items-center gap-1.5 border-b border-black/[0.06] px-1.5">
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-full text-[#353735] hover:bg-black/5"
                aria-label="Voltar"
              >
                <ChevronLeft className="size-5" strokeWidth={2.2} />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <MyWatiLogo />
                <div className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-[15px] font-medium text-[#111b21]">
                    {businessName}
                  </span>
                  <VerifiedBadge />
                </div>
              </div>
              <div className="flex items-center gap-0.5 text-[#353735]">
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full hover:bg-black/5"
                  aria-hidden
                >
                  <Phone className="size-[18px]" />
                </button>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full hover:bg-black/5"
                  aria-hidden
                >
                  <MoreVertical className="size-[18px]" />
                </button>
              </div>
            </div>
          </div>

          {/* Chat area: altura fixa no telefone; só esta região rola. */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2 py-3">
            <p className="shrink-0 rounded-lg bg-[#DBF2F1] px-2.5 py-2 text-[11px] leading-snug text-[#607372]">
              {t("view.previewDisclaimer")}
            </p>

            {/* Bolha única: fundo branco homogêneo; divisor só acima dos botões. */}
            <div className="shrink-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/[0.06]">
              <div
                className={`px-2.5 pt-2.5 ${!hasFooter && !hasButtons ? "pb-2.5" : ""}`}
              >
                {model.header.kind === "text" && (
                  <div className="mb-2 text-left text-[15px] font-semibold leading-snug text-[#111b21]">
                    {model.header.text}
                  </div>
                )}
                {model.header.kind === "image" &&
                  (model.header.src ? (
                    <div className="mb-1">
                      {model.header.variable ? (
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          {t("view.previewImageApprovalSample")}
                        </p>
                      ) : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={model.header.src}
                        alt=""
                        className="max-h-[200px] w-full rounded-lg border border-black/10 object-cover"
                      />
                    </div>
                  ) : model.header.variable ? (
                    <HeaderMediaPlaceholder
                      label={t("view.previewImageVariable")}
                    />
                  ) : (
                    <HeaderMediaPlaceholder label={t("view.previewImage")} />
                  ))}
                {model.header.kind === "video" && (
                  <HeaderMediaPlaceholder label="Vídeo" />
                )}
                {model.header.kind === "document" && (
                  <HeaderMediaPlaceholder label="Documento" />
                )}

                <div className="px-0 py-1 text-[14px] leading-snug text-[#111b21]">
                  {model.body.trim() ? (
                    <WhatsAppMdPreview text={model.body} />
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </div>
              </div>

              {hasFooter ? (
                <div className="mt-2 flex items-end justify-between gap-2 px-2.5 pb-2 pt-1 text-[12px] text-[#667781]">
                  <span className="min-w-0 flex-1 leading-snug">
                    {model.footer.trim()}
                  </span>
                  <time
                    className="shrink-0 tabular-nums text-[11px] text-[#667781]/90"
                    dateTime={now.toISOString()}
                  >
                    {timeLabel}
                  </time>
                </div>
              ) : null}

              {hasButtons ? (
                <div
                  className="preview-message__callAction-buttons border-t border-[#E9EDEF]"
                  data-testid="messageTemplate-addTemplateModal-preview-callAction-buttons"
                >
                  {model.buttons.map((b, i) => {
                    const row =
                      "preview-message__callAction-button flex w-full cursor-default items-center justify-center gap-2 px-3 py-[11px] text-[15px] font-medium leading-tight text-[#027EB5] antialiased";
                    const divider = i > 0 ? "border-t border-[#E9EDEF]" : "";
                    if (b.kind === "url") {
                      return (
                        <div
                          key={`cta-${i}`}
                          className={`${row} ${divider} preview-message__callAction-button_url`}
                          data-testid="messageTemplate-addTemplateModal-preview-calltoAction-button"
                        >
                          <ExternalLink
                            className="size-[18px] shrink-0"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span className="min-w-0 truncate">{b.text}</span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`qr-${i}`}
                        className={`${row} ${divider} preview-message__callAction-button_reply`}
                        data-testid="messageTemplate-addTemplateModal-preview-quickReply-button"
                      >
                        <Reply
                          className="size-[18px] shrink-0"
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="min-w-0 truncate">{b.text}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          {/* Composer bar */}
          <div className="flex h-12 shrink-0 items-center justify-around border-t border-black/[0.08] bg-white px-2 text-[#353735]">
            <button type="button" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5" aria-hidden>
              <Plus className="size-[18px]" strokeWidth={1.6} />
            </button>
            <button type="button" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5" aria-hidden>
              <Smile className="size-[18px]" strokeWidth={1.4} />
            </button>
            <button type="button" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5" aria-hidden>
              <Paperclip className="size-[18px]" strokeWidth={1.4} />
            </button>
            <button type="button" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5" aria-hidden>
              <Camera className="size-[18px]" strokeWidth={1.4} />
            </button>
            <button type="button" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5" aria-hidden>
              <Mic className="size-[18px]" strokeWidth={1.4} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
