"use client";

import { api } from "@ast24/hmbt-v5-lib";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  apiPostGlobalCafemenuYearMonthDayImage,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  shouldShowFatalErrorPage,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { FormFieldLabel } from "@/shared/components/form-field-label";
import { AppShell } from "@/shared/layout/app-shell";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

function toDateInputValue(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Invalid file reader result"));
        return;
      }
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

function resolveUploadErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.InvalidRequest:
    case api.errors.CommonApiErrorCode.InvalidJsonBody:
    case api.errors.CommonApiErrorCode.MissingPathParameter:
      return "画像データまたは日付範囲の指定が不正です。入力内容を確認してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "画像アップロード機能が一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

export default function CafeMenuUploadSettingsPage() {
  const router = useRouter();

  const [dateInput, setDateInput] = useState<string>(() =>
    toDateInputValue(new Date()),
  );
  const [rangeDaysInput, setRangeDaysInput] = useState<string>("1");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<
    string | null
  >(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedRangeDays = useMemo(() => {
    const parsed = Number.parseInt(rangeDaysInput, 10);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, Math.min(parsed, 31));
  }, [rangeDaysInput]);

  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return null;
    }

    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    setUploadSuccessMessage(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      event.target.value = "";
      setSelectedFile(null);
      setDialogMessage(
        "対応していない画像形式です。PNG/JPEG/WEBPファイルを選択してください。",
      );
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      event.target.value = "";
      setSelectedFile(null);
      setDialogMessage(
        "画像サイズが大きすぎます。30MB以下の画像を選択してください。",
      );
      return;
    }

    setSelectedFile(file);
  };

  const uploadImage = async () => {
    if (!selectedFile) {
      setDialogMessage("アップロードする画像ファイルを選択してください。");
      return;
    }

    const targetDate = parseDateInputValue(dateInput);
    if (!targetDate) {
      setDialogMessage("適用開始日を正しく入力してください。");
      return;
    }

    setIsUploading(true);
    setDialogMessage(null);
    setUploadSuccessMessage(null);

    let imageDataUrl = "";
    try {
      imageDataUrl = await readFileAsDataUrl(selectedFile);
    } catch {
      setIsUploading(false);
      setDialogMessage(
        "画像ファイルの読み込みに失敗しました。別のファイルで再試行してください。",
      );
      return;
    }

    const result = await apiPostGlobalCafemenuYearMonthDayImage(
      targetDate,
      normalizedRangeDays,
      {
        image_data_url: imageDataUrl,
      },
    );

    if (isNoAuthApiResult(result)) {
      setIsUploading(false);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsUploading(false);

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setDialogMessage(
        resolveUploadErrorMessage(
          result.type === "http_error" ? result.error.code : apiError?.code,
          apiError?.message ?? "カフェメニュー画像のアップロードに失敗しました",
        ),
      );
      return;
    }

    setIsUploading(false);
    setUploadSuccessMessage(
      `${result.data.range_days}日分の画像アップロードを受け付けました。1分以内に適用されます。`,
    );
    setDateInput(toDateInputValue(new Date()));
    setRangeDaysInput("1");
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <AppShell
      title="カフェメニュー画像アップロード"
      description="OCRは使わず、指定した開始日から日数分のカフェメニュー画像URLを一括で設定します。"
    >
      <section className="panel settings-card">
        <h2>アップロード設定</h2>
        <p className="settings-note">
          PNG/JPEG/WEBPのみ対応・最大30MBです。アップロード時にLINE送信用の形式/容量へ自動変換し、原本(10MB以下)とプレビュー(1MB以下)を保存します。
        </p>

        <div className="settings-form">
          <div className="form-row">
            <label className="form-field">
              <FormFieldLabel required>適用開始日 (UTC)</FormFieldLabel>
              <input
                type="date"
                value={dateInput}
                onChange={(event) => {
                  setDateInput(event.target.value);
                  setUploadSuccessMessage(null);
                }}
              />
            </label>

            <label className="form-field">
              <FormFieldLabel required>適用日数 (1-31日)</FormFieldLabel>
              <input
                type="number"
                min={1}
                max={31}
                step={1}
                value={rangeDaysInput}
                onChange={(event) => {
                  setRangeDaysInput(event.target.value);
                  setUploadSuccessMessage(null);
                }}
              />
            </label>
          </div>

          <label className="form-field">
            <FormFieldLabel required>画像ファイル</FormFieldLabel>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_MIME_TYPES.join(",")}
              onChange={onSelectFile}
            />
          </label>

          {selectedFile && (
            <p className="settings-note">
              選択中: {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)}
              KB)
            </p>
          )}

          {previewUrl && (
            <div className="cafe-upload-preview">
              <Image
                src={previewUrl}
                alt="アップロード予定のカフェメニュー画像プレビュー"
                width={1200}
                height={1600}
                unoptimized
                className="cafe-upload-preview__image"
              />
            </div>
          )}

          <div className="hero-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => {
                void uploadImage();
              }}
              disabled={isUploading}
            >
              {isUploading ? "アップロード中..." : "画像をアップロードして反映"}
            </button>
            <Link href="/home" className="button ghost">
              ホーム画面で確認
            </Link>
          </div>
        </div>
      </section>

      {uploadSuccessMessage && (
        <section className="panel settings-card">
          <h2>アップロード完了</h2>
          <p>{uploadSuccessMessage}</p>
        </section>
      )}

      {dialogMessage && (
        <ErrorDialog
          title="画像アップロードに失敗しました"
          message={dialogMessage}
          onClose={() => {
            setDialogMessage(null);
          }}
        />
      )}
    </AppShell>
  );
}
