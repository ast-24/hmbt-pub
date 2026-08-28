"use client";

import { api, cmn, dto, knowledge } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiGetUsersUserIdSettingsWebUi,
  apiPutUsersUserIdSettingsWebUi,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { FormFieldLabel } from "@/shared/components/form-field-label";
import { SaveDiscardBar } from "@/shared/components/save-discard-bar";
import { AppShell } from "@/shared/layout/app-shell";
import {
  cloneWebUiConfig,
  createDefaultDailyItem,
  createDefaultWidget,
  DAILY_ITEM_LABEL,
  normalizeWebUiConfig,
  serializeWebUiConfig,
  summarizeWidgetParam,
  WEB_WIDGET_LABEL,
} from "@/shared/settings/web-ui-config";

function moveIndex<T>(array: T[], from: number, to: number): T[] {
  if (from === to) {
    return [...array];
  }

  const clone = [...array];
  const [item] = clone.splice(from, 1);
  clone.splice(to, 0, item);
  return clone;
}

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(parsed));
}

function parseNonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
}

function formatTimeOnly(value: cmn.time.TimeOnly): string {
  return `${String(value.h).padStart(2, "0")}:${String(value.m).padStart(2, "0")}`;
}

function parseTimeOnly(
  value: string,
  fallback: cmn.time.TimeOnly,
): cmn.time.TimeOnly {
  const matched = value.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!matched) {
    return cmn.time.TimeOnly.new(fallback.h, fallback.m);
  }

  const hour = Number.parseInt(matched[1], 10);
  const minute = Number.parseInt(matched[2], 10);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return cmn.time.TimeOnly.new(fallback.h, fallback.m);
  }

  return cmn.time.TimeOnly.new(hour, minute);
}

function resolveWebSettingsErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ResourceNotFound:
      return "ホーム画面設定が見つかりませんでした。再読み込みして再試行してください。";
    case api.errors.CommonApiErrorCode.InvalidRequest:
    case api.errors.CommonApiErrorCode.InvalidJsonBody:
    case api.errors.CommonApiErrorCode.MissingPathParameter:
      return "送信内容が不正です。入力内容を確認して再試行してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

const TIME_DISPLAY_ACCURACY_NOTE =
  "※短縮時程などの影響で、表示時刻が実際とずれる場合があります。";

export type WebSettingsViewProps = {
  reloadOnSave?: boolean;
  onSaved?: () => void;
};

export function WebSettingsView({
  reloadOnSave = true,
  onSaved,
}: WebSettingsViewProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [saveErrorDialog, setSaveErrorDialog] = useState<string | null>(null);
  const [originalConfig, setOriginalConfig] =
    useState<dto.user_config.UserConfigWebUI | null>(null);
  const [draftConfig, setDraftConfig] =
    useState<dto.user_config.UserConfigWebUI | null>(null);
  const [widgetTypeToAdd, setWidgetTypeToAdd] =
    useState<dto.web_home_widget.WebHomeWidgetType>(
      dto.web_home_widget.WebHomeWidgetType.PersonalSchedule,
    );
  const [dailyItemTypeToAdd, setDailyItemTypeToAdd] = useState<
    Record<
      number,
      dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
    >
  >({});
  const [collapsedWidgetCards, setCollapsedWidgetCards] = useState<
    Record<string, boolean>
  >({});

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSaveErrorDialog(null);

    const result = await apiGetUsersUserIdSettingsWebUi("me");
    if (isNoAuthApiResult(result)) {
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.replace(buildFatalErrorPageHref(apiError));
        return;
      }

      const message = resolveWebSettingsErrorMessage(
        result.type === "http_error" ? result.error.code : apiError?.code,
        apiError?.message ?? "ホーム画面設定の取得に失敗しました",
      );
      setError(
        apiError
          ? {
              ...apiError,
              message,
            }
          : {
              type: "network_error",
              message,
            },
      );
      setIsLoading(false);
      return;
    }

    const normalized = normalizeWebUiConfig(result.data.config);
    const cloned = cloneWebUiConfig(normalized);
    setOriginalConfig(cloned);
    setDraftConfig(cloneWebUiConfig(cloned));
    setCollapsedWidgetCards({});
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadPage]);

  const isDirty = useMemo(() => {
    if (!originalConfig || !draftConfig) {
      return false;
    }

    return (
      serializeWebUiConfig(originalConfig) !== serializeWebUiConfig(draftConfig)
    );
  }, [draftConfig, originalConfig]);

  const updateDraft = (
    updater: (
      config: dto.user_config.UserConfigWebUI,
    ) => dto.user_config.UserConfigWebUI,
  ) => {
    setDraftConfig((prev) => {
      if (!prev) {
        return prev;
      }
      return updater(prev);
    });
  };

  const updateWidget = (
    widgetIndex: number,
    updater: (
      widget: dto.web_home_widget.WebHomeWidgetWithParam,
    ) => dto.web_home_widget.WebHomeWidgetWithParam,
  ) => {
    updateDraft((config) => {
      const widgets = [...config.widgets];
      widgets[widgetIndex] = updater(widgets[widgetIndex]);
      return {
        ...config,
        widgets,
      };
    });
  };

  const moveWidget = (widgetIndex: number, offset: -1 | 1) => {
    updateDraft((config) => {
      const nextIndex = widgetIndex + offset;
      if (nextIndex < 0 || nextIndex >= config.widgets.length) {
        return config;
      }

      return {
        ...config,
        widgets: moveIndex(config.widgets, widgetIndex, nextIndex),
      };
    });
  };

  const removeWidget = (widgetIndex: number) => {
    updateDraft((config) => {
      const widgets = config.widgets.filter(
        (_, index) => index !== widgetIndex,
      );
      return {
        ...config,
        widgets,
      };
    });
  };

  const addWidget = () => {
    updateDraft((config) => ({
      ...config,
      widgets: [...config.widgets, createDefaultWidget(widgetTypeToAdd)],
    }));
  };

  const moveDailyItem = (
    widgetIndex: number,
    itemIndex: number,
    offset: -1 | 1,
  ) => {
    updateWidget(widgetIndex, (widget) => {
      if (
        widget.type !== dto.web_home_widget.WebHomeWidgetType.PersonalSchedule
      ) {
        return widget;
      }

      const nextIndex = itemIndex + offset;
      if (nextIndex < 0 || nextIndex >= widget.param.daily_items.length) {
        return widget;
      }

      return {
        ...widget,
        param: {
          ...widget.param,
          daily_items: moveIndex(
            widget.param.daily_items,
            itemIndex,
            nextIndex,
          ),
        },
      };
    });
  };

  const removeDailyItem = (widgetIndex: number, itemIndex: number) => {
    updateWidget(widgetIndex, (widget) => {
      if (
        widget.type !== dto.web_home_widget.WebHomeWidgetType.PersonalSchedule
      ) {
        return widget;
      }

      return {
        ...widget,
        param: {
          ...widget.param,
          daily_items: widget.param.daily_items.filter(
            (_, index) => index !== itemIndex,
          ),
        },
      };
    });
  };

  const addDailyItem = (widgetIndex: number) => {
    const itemType =
      dailyItemTypeToAdd[widgetIndex] ??
      dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Events;

    updateWidget(widgetIndex, (widget) => {
      if (
        widget.type !== dto.web_home_widget.WebHomeWidgetType.PersonalSchedule
      ) {
        return widget;
      }

      return {
        ...widget,
        param: {
          ...widget.param,
          daily_items: [
            ...widget.param.daily_items,
            createDefaultDailyItem(itemType),
          ],
        },
      };
    });
  };

  const updateSessionDailyItemParam = (
    widgetIndex: number,
    itemIndex: number,
    updater: (
      param: dto.web_home_widget.WebHomeWidgetDailyItemParamSess,
    ) => dto.web_home_widget.WebHomeWidgetDailyItemParamSess,
  ) => {
    updateWidget(widgetIndex, (candidate) => {
      if (
        candidate.type !==
        dto.web_home_widget.WebHomeWidgetType.PersonalSchedule
      ) {
        return candidate;
      }

      const dailyItems = [...candidate.param.daily_items];
      const dailyItem = dailyItems[itemIndex];
      if (
        !dailyItem ||
        (dailyItem.type !==
          dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess &&
          dailyItem.type !==
            dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
              .MorningSess &&
          dailyItem.type !==
            dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
              .AfternoonSess)
      ) {
        return candidate;
      }

      dailyItems[itemIndex] = {
        ...dailyItem,
        param: updater(dailyItem.param),
      };

      return {
        ...candidate,
        param: {
          ...candidate.param,
          daily_items: dailyItems,
        },
      };
    });
  };

  const updateCafeDailyItemParam = (
    widgetIndex: number,
    itemIndex: number,
    updater: (
      param: dto.web_home_widget.WebHomeWidgetDailyItemParamCafe,
    ) => dto.web_home_widget.WebHomeWidgetDailyItemParamCafe,
  ) => {
    updateWidget(widgetIndex, (candidate) => {
      if (
        candidate.type !==
        dto.web_home_widget.WebHomeWidgetType.PersonalSchedule
      ) {
        return candidate;
      }

      const dailyItems = [...candidate.param.daily_items];
      const dailyItem = dailyItems[itemIndex];
      if (
        !dailyItem ||
        dailyItem.type !==
          dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Cafe
      ) {
        return candidate;
      }

      dailyItems[itemIndex] = {
        ...dailyItem,
        param: updater(dailyItem.param),
      };

      return {
        ...candidate,
        param: {
          ...candidate.param,
          daily_items: dailyItems,
        },
      };
    });
  };

  const toggleWidgetCard = (cardKey: string) => {
    setCollapsedWidgetCards((prev) => ({
      ...prev,
      [cardKey]: !(prev[cardKey] ?? false),
    }));
  };

  const saveWebSettings = async () => {
    if (!draftConfig) {
      return;
    }

    setIsSaving(true);
    setSaveErrorDialog(null);

    const result = await apiPutUsersUserIdSettingsWebUi("me", {
      config: cloneWebUiConfig(draftConfig),
    });

    if (isNoAuthApiResult(result)) {
      setIsSaving(false);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsSaving(false);

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setSaveErrorDialog(
        resolveWebSettingsErrorMessage(
          result.type === "http_error" ? result.error.code : apiError?.code,
          apiError?.message ?? "ホーム画面設定の保存に失敗しました",
        ),
      );
      return;
    }

    const saved = cloneWebUiConfig(draftConfig);
    setOriginalConfig(saved);
    setDraftConfig(cloneWebUiConfig(saved));
    setIsSaving(false);
    onSaved?.();

    if (reloadOnSave) {
      window.location.reload();
    }
  };

  return (
    <>
      {isLoading && (
        <section className="panel">
          <p>読み込み中...</p>
        </section>
      )}

      {!isLoading && error && (
        <section className="panel panel-error">
          <h2>ホーム画面設定の読み込みに失敗しました</h2>
          <p>{error.message}</p>
          {(error.type === "unauthorized" || error.type === "forbidden") && (
            <Link href="/login" className="button primary">
              ログインページへ
            </Link>
          )}
        </section>
      )}

      {!isLoading && !error && draftConfig && (
        <>
          <section className="panel settings-card">
            <h2>テーマ</h2>
            <label className="form-field">
              <FormFieldLabel required>画面テーマ</FormFieldLabel>
              <select
                value={draftConfig.theme}
                onChange={(event) => {
                  const nextTheme = event.target
                    .value as dto.user_config.UserConfigWebUI["theme"];
                  updateDraft((config) => ({
                    ...config,
                    theme: nextTheme,
                  }));
                }}
              >
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
                <option value="system">端末設定に合わせる</option>
              </select>
            </label>
          </section>

          <section className="panel settings-card">
            <h2>UI設定ボタン</h2>
            <label className="form-field">
              <FormFieldLabel required>UI設定ボタンを表示するか</FormFieldLabel>
              <select
                value={draftConfig.show_ui_settings_button ? "show" : "hide"}
                onChange={(event) => {
                  updateDraft((config) => ({
                    ...config,
                    show_ui_settings_button: event.target.value === "show",
                  }));
                }}
              >
                <option value="show">表示する</option>
                <option value="hide">表示しない</option>
              </select>
            </label>
          </section>

          <section className="panel settings-card">
            <h2>ウィジェット順序</h2>
            <p className="settings-note">
              「追加」で増やし、↑↓で順番を変え、-で削除できます。
            </p>

            <div className="inline-controls">
              <label className="form-field">
                <FormFieldLabel>追加するウィジェット</FormFieldLabel>
                <select
                  value={widgetTypeToAdd}
                  onChange={(event) => {
                    setWidgetTypeToAdd(
                      event.target
                        .value as dto.web_home_widget.WebHomeWidgetType,
                    );
                  }}
                >
                  {Object.values(dto.web_home_widget.WebHomeWidgetType).map(
                    (type) => (
                      <option key={type} value={type}>
                        {WEB_WIDGET_LABEL[type]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <button
                type="button"
                className="button ghost"
                onClick={addWidget}
              >
                + 追加
              </button>
            </div>

            <div className="widget-setting-list">
              {draftConfig.widgets.map((widget, widgetIndex) => {
                const cardKey = `${widget.type}-${widgetIndex}`;
                const isCollapsed = collapsedWidgetCards[cardKey] ?? false;

                return (
                  <article className="widget-setting-card" key={cardKey}>
                    <header className="widget-setting-card__header">
                      <button
                        type="button"
                        className="widget-setting-card__title-button"
                        onClick={() => {
                          toggleWidgetCard(cardKey);
                        }}
                        aria-expanded={!isCollapsed}
                      >
                        <span className="widget-setting-card__title-main">
                          <h3>
                            {widgetIndex + 1}. {WEB_WIDGET_LABEL[widget.type]}
                          </h3>
                          <p>{summarizeWidgetParam(widget)}</p>
                        </span>
                        <span
                          className="widget-setting-card__title-toggle"
                          aria-hidden
                        >
                          {isCollapsed ? "▲" : "▼"}
                        </span>
                      </button>
                      <div className="inline-controls compact">
                        <button
                          type="button"
                          className="button ghost"
                          onClick={() => {
                            moveWidget(widgetIndex, -1);
                          }}
                          disabled={widgetIndex === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="button ghost"
                          onClick={() => {
                            moveWidget(widgetIndex, 1);
                          }}
                          disabled={
                            widgetIndex === draftConfig.widgets.length - 1
                          }
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="button ghost danger"
                          onClick={() => {
                            removeWidget(widgetIndex);
                          }}
                        >
                          -
                        </button>
                      </div>
                    </header>

                    {!isCollapsed && (
                      <>
                        {widget.type ===
                          dto.web_home_widget.WebHomeWidgetType
                            .PersonalSchedule && (
                          <div className="settings-form">
                            <div className="form-row">
                              <label className="form-field">
                                <FormFieldLabel required>
                                  表示方向
                                </FormFieldLabel>
                                <select
                                  value={widget.param.direction}
                                  onChange={(event) => {
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .PersonalSchedule
                                      ) {
                                        return candidate;
                                      }
                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          direction: event.target
                                            .value as dto.web_home_widget.WebHomeWidgetParamPersonalSchedule["direction"],
                                        },
                                      };
                                    });
                                  }}
                                >
                                  <option value="horizontal">横並び</option>
                                  <option value="vertical">縦並び</option>
                                </select>
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>
                                  ここから表示日数
                                </FormFieldLabel>
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  value={widget.param.length}
                                  onChange={(event) => {
                                    const nextLength = parsePositiveNumber(
                                      event.target.value,
                                      widget.param.length,
                                    );

                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .PersonalSchedule
                                      ) {
                                        return candidate;
                                      }
                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          length: nextLength,
                                        },
                                      };
                                    });
                                  }}
                                />
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>
                                  過去表示日数
                                </FormFieldLabel>
                                <input
                                  type="number"
                                  min={0}
                                  max={30}
                                  value={widget.param.past_days}
                                  onChange={(event) => {
                                    const nextPastDays = parseNonNegativeNumber(
                                      event.target.value,
                                      widget.param.past_days,
                                    );

                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .PersonalSchedule
                                      ) {
                                        return candidate;
                                      }
                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          past_days: nextPastDays,
                                        },
                                      };
                                    });
                                  }}
                                />
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>
                                  日付切替時刻
                                </FormFieldLabel>
                                <input
                                  type="time"
                                  step={60}
                                  value={formatTimeOnly(
                                    widget.param.day_switch_time,
                                  )}
                                  onChange={(event) => {
                                    const nextSwitchTime = parseTimeOnly(
                                      event.target.value,
                                      widget.param.day_switch_time,
                                    );

                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .PersonalSchedule
                                      ) {
                                        return candidate;
                                      }
                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          day_switch_time: nextSwitchTime,
                                        },
                                      };
                                    });
                                  }}
                                />
                              </label>
                            </div>

                            <div className="inline-check-grid">
                              <label className="form-check inline">
                                <input
                                  type="checkbox"
                                  checked={
                                    widget.param.show_period_change_button
                                  }
                                  onChange={(event) => {
                                    const checked = event.target.checked;

                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .PersonalSchedule
                                      ) {
                                        return candidate;
                                      }
                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          show_period_change_button: checked,
                                        },
                                      };
                                    });
                                  }}
                                />
                                期間変更ボタンを表示
                              </label>
                            </div>

                            <section className="nested-settings">
                              <header>
                                <h4>1日の表示項目</h4>
                              </header>
                              <div className="inline-controls">
                                <label className="form-field">
                                  <FormFieldLabel>追加する項目</FormFieldLabel>
                                  <select
                                    value={
                                      dailyItemTypeToAdd[widgetIndex] ??
                                      dto.web_home_widget
                                        .WebHomeWidgetPersonalScheduleDailyItemType
                                        .Events
                                    }
                                    onChange={(event) => {
                                      setDailyItemTypeToAdd((prev) => ({
                                        ...prev,
                                        [widgetIndex]: event.target
                                          .value as dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType,
                                      }));
                                    }}
                                  >
                                    {Object.values(
                                      dto.web_home_widget
                                        .WebHomeWidgetPersonalScheduleDailyItemType,
                                    ).map((type) => (
                                      <option key={type} value={type}>
                                        {DAILY_ITEM_LABEL[type]}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  className="button ghost"
                                  onClick={() => {
                                    addDailyItem(widgetIndex);
                                  }}
                                >
                                  + 追加
                                </button>
                              </div>

                              <ul className="list-editor">
                                {widget.param.daily_items.map(
                                  (item, itemIndex) => (
                                    <li
                                      className="list-editor__item"
                                      key={`${item.type}-${itemIndex}`}
                                    >
                                      <div className="list-editor__row list-editor__row--title-controls">
                                        <div className="inline-controls compact list-editor__title-controls">
                                          <strong>
                                            {itemIndex + 1}.{" "}
                                            {DAILY_ITEM_LABEL[item.type]}
                                          </strong>
                                          <button
                                            type="button"
                                            className="button ghost"
                                            onClick={() => {
                                              moveDailyItem(
                                                widgetIndex,
                                                itemIndex,
                                                -1,
                                              );
                                            }}
                                            disabled={itemIndex === 0}
                                          >
                                            ↑
                                          </button>
                                          <button
                                            type="button"
                                            className="button ghost"
                                            onClick={() => {
                                              moveDailyItem(
                                                widgetIndex,
                                                itemIndex,
                                                1,
                                              );
                                            }}
                                            disabled={
                                              itemIndex ===
                                              widget.param.daily_items.length -
                                                1
                                            }
                                          >
                                            ↓
                                          </button>
                                          <button
                                            type="button"
                                            className="button ghost danger"
                                            onClick={() => {
                                              removeDailyItem(
                                                widgetIndex,
                                                itemIndex,
                                              );
                                            }}
                                          >
                                            -
                                          </button>
                                        </div>
                                      </div>

                                      {(item.type ===
                                        dto.web_home_widget
                                          .WebHomeWidgetPersonalScheduleDailyItemType
                                          .Sess ||
                                        item.type ===
                                          dto.web_home_widget
                                            .WebHomeWidgetPersonalScheduleDailyItemType
                                            .MorningSess ||
                                        item.type ===
                                          dto.web_home_widget
                                            .WebHomeWidgetPersonalScheduleDailyItemType
                                            .AfternoonSess) && (
                                        <>
                                          <div className="inline-check-grid">
                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={
                                                  item.param.show_subject
                                                }
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_subject: checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              教科を表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={
                                                  item.param
                                                    .show_short_course_name
                                                }
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_short_course_name:
                                                        checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              科目を短縮表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={
                                                  item.param
                                                    .show_timetable_position
                                                }
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_timetable_position:
                                                        checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              時間割位置を表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={
                                                  item.param.highlight_mismatch
                                                }
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      highlight_mismatch:
                                                        checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              通常と違うコマをハイライト
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={item.param.show_room}
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_room: checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              教室を表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={
                                                  item.param.show_room_floor
                                                }
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_room_floor: checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              教室の階を表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={item.param.show_time}
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_time: checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              開始終了時刻を表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={
                                                  item.param.show_duration
                                                }
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_duration: checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              授業時間を表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={item.param.show_memo}
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_memo: checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              メモを表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={
                                                  item.param.show_personal_memo
                                                }
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_personal_memo:
                                                        checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              個人メモを表示
                                            </label>

                                            <label className="form-check inline">
                                              <input
                                                type="checkbox"
                                                checked={
                                                  item.param.show_shared_memo
                                                }
                                                onChange={(event) => {
                                                  const checked =
                                                    event.target.checked;
                                                  updateSessionDailyItemParam(
                                                    widgetIndex,
                                                    itemIndex,
                                                    (param) => ({
                                                      ...param,
                                                      show_shared_memo: checked,
                                                    }),
                                                  );
                                                }}
                                              />
                                              共有メモを表示
                                            </label>
                                          </div>

                                          <p className="settings-note">
                                            {TIME_DISPLAY_ACCURACY_NOTE}
                                          </p>
                                        </>
                                      )}

                                      {item.type ===
                                        dto.web_home_widget
                                          .WebHomeWidgetPersonalScheduleDailyItemType
                                          .Cafe && (
                                        <label className="form-check inline">
                                          <input
                                            type="checkbox"
                                            checked={
                                              item.param.show_menu_button
                                            }
                                            onChange={(event) => {
                                              const checked =
                                                event.target.checked;
                                              updateCafeDailyItemParam(
                                                widgetIndex,
                                                itemIndex,
                                                (param) => ({
                                                  ...param,
                                                  show_menu_button: checked,
                                                }),
                                              );
                                            }}
                                          />
                                          メニューボタンを表示
                                        </label>
                                      )}
                                    </li>
                                  ),
                                )}
                              </ul>
                            </section>
                          </div>
                        )}

                        {widget.type ===
                          dto.web_home_widget.WebHomeWidgetType.CafeMenu && (
                          <div className="settings-form">
                            <div className="form-row">
                              <label className="form-field">
                                <FormFieldLabel required>
                                  表示の優先
                                </FormFieldLabel>
                                <select
                                  value={widget.param.display_preference}
                                  onChange={(event) => {
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .CafeMenu
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          display_preference: event.target
                                            .value as dto.web_home_widget.WebHomeWidgetParamCafeMenu["display_preference"],
                                        },
                                      };
                                    });
                                  }}
                                >
                                  <option value="str">文字</option>
                                  <option value="image">画像</option>
                                </select>
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>
                                  文字表示の日数
                                </FormFieldLabel>
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  value={widget.param.str_length}
                                  onChange={(event) => {
                                    const nextLength = parsePositiveNumber(
                                      event.target.value,
                                      widget.param.str_length,
                                    );

                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .CafeMenu
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          str_length: nextLength,
                                        },
                                      };
                                    });
                                  }}
                                />
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>
                                  文字表示の並び
                                </FormFieldLabel>
                                <select
                                  value={widget.param.str_direction}
                                  onChange={(event) => {
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .CafeMenu
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          str_direction: event.target
                                            .value as dto.web_home_widget.WebHomeWidgetParamCafeMenu["str_direction"],
                                        },
                                      };
                                    });
                                  }}
                                >
                                  <option value="horizontal">横並び</option>
                                  <option value="vertical">縦並び</option>
                                </select>
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>
                                  画像表示の並び
                                </FormFieldLabel>
                                <select
                                  value={widget.param.image_direction}
                                  onChange={(event) => {
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .CafeMenu
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          image_direction: event.target
                                            .value as dto.web_home_widget.WebHomeWidgetParamCafeMenu["image_direction"],
                                        },
                                      };
                                    });
                                  }}
                                >
                                  <option value="horizontal">横並び</option>
                                  <option value="vertical">縦並び</option>
                                </select>
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>
                                  日付切替時刻
                                </FormFieldLabel>
                                <input
                                  type="time"
                                  step={60}
                                  value={formatTimeOnly(
                                    widget.param.day_switch_time,
                                  )}
                                  onChange={(event) => {
                                    const nextSwitchTime = parseTimeOnly(
                                      event.target.value,
                                      widget.param.day_switch_time,
                                    );

                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .CafeMenu
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          day_switch_time: nextSwitchTime,
                                        },
                                      };
                                    });
                                  }}
                                />
                              </label>
                            </div>

                            <div className="inline-check-grid">
                              <label className="form-check inline">
                                <input
                                  type="checkbox"
                                  checked={widget.param.show_as_str}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .CafeMenu
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          show_as_str: checked,
                                        },
                                      };
                                    });
                                  }}
                                />
                                文字表示
                              </label>

                              <label className="form-check inline">
                                <input
                                  type="checkbox"
                                  checked={widget.param.show_as_image}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .CafeMenu
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          show_as_image: checked,
                                        },
                                      };
                                    });
                                  }}
                                />
                                画像表示
                              </label>

                              <label className="form-check inline">
                                <input
                                  type="checkbox"
                                  checked={widget.param.show_next_week_image}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .CafeMenu
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          show_next_week_image: checked,
                                        },
                                      };
                                    });
                                  }}
                                />
                                来週画像も表示
                              </label>
                            </div>
                          </div>
                        )}

                        {widget.type ===
                          dto.web_home_widget.WebHomeWidgetType.NextTrain && (
                          <div className="settings-form">
                            <div className="form-row">
                              <label className="form-field">
                                <FormFieldLabel required>
                                  表示モード
                                </FormFieldLabel>
                                <select
                                  value={widget.param.mode}
                                  onChange={(event) => {
                                    const mode = event.target.value as
                                      | "always"
                                      | "switch";
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .NextTrain
                                      ) {
                                        return candidate;
                                      }

                                      if (mode === candidate.param.mode) {
                                        return candidate;
                                      }

                                      if (mode === "always") {
                                        const ids =
                                          candidate.param.mode === "switch"
                                            ? candidate.param.after_ids
                                            : candidate.param.timetable_ids;
                                        return {
                                          ...candidate,
                                          param: {
                                            mode: "always",
                                            timetable_ids: ids,
                                            show_count:
                                              candidate.param.show_count,
                                            time_format:
                                              candidate.param.time_format,
                                          },
                                        };
                                      }

                                      const afterIds =
                                        candidate.param.mode === "always"
                                          ? candidate.param.timetable_ids
                                          : candidate.param.after_ids;

                                      return {
                                        ...candidate,
                                        param: {
                                          mode: "switch",
                                          switch_time: cmn.time.TimeOnly.new(
                                            12,
                                            0,
                                          ),
                                          before_ids: [
                                            knowledge.train_timetable
                                              .TrainTimetableID
                                              .JrTsurumiLine_Tsurumi_TsurumiOno,
                                          ],
                                          after_ids: afterIds,
                                          show_count:
                                            candidate.param.show_count,
                                          time_format:
                                            candidate.param.time_format,
                                        },
                                      };
                                    });
                                  }}
                                >
                                  <option value="switch">時刻で切替</option>
                                  <option value="always">常に表示</option>
                                </select>
                              </label>

                              {widget.param.mode === "switch" && (
                                <label className="form-field">
                                  <FormFieldLabel required>
                                    切替時刻
                                  </FormFieldLabel>
                                  <input
                                    type="time"
                                    value={formatTimeOnly(
                                      (
                                        widget.param as Extract<
                                          dto.web_home_widget.WebHomeWidgetParamNextTrain,
                                          { mode: "switch" }
                                        >
                                      ).switch_time,
                                    )}
                                    onChange={(event) => {
                                      const next = parseTimeOnly(
                                        event.target.value,
                                        (
                                          widget.param as Extract<
                                            dto.web_home_widget.WebHomeWidgetParamNextTrain,
                                            { mode: "switch" }
                                          >
                                        ).switch_time,
                                      );
                                      updateWidget(widgetIndex, (candidate) => {
                                        if (
                                          candidate.type !==
                                            dto.web_home_widget
                                              .WebHomeWidgetType.NextTrain ||
                                          candidate.param.mode !== "switch"
                                        ) {
                                          return candidate;
                                        }
                                        return {
                                          ...candidate,
                                          param: {
                                            ...candidate.param,
                                            switch_time: next,
                                          },
                                        };
                                      });
                                    }}
                                  />
                                </label>
                              )}
                            </div>

                            <div className="form-row">
                              <label className="form-field">
                                <FormFieldLabel required>
                                  表示件数
                                </FormFieldLabel>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={widget.param.show_count}
                                  onChange={(event) => {
                                    const nextCount = parsePositiveNumber(
                                      event.target.value,
                                      widget.param.show_count,
                                    );
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .NextTrain
                                      ) {
                                        return candidate;
                                      }
                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          show_count: Math.min(10, nextCount),
                                        },
                                      };
                                    });
                                  }}
                                />
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>
                                  表示形式
                                </FormFieldLabel>
                                <select
                                  value={widget.param.time_format}
                                  onChange={(event) => {
                                    const next = event.target.value as
                                      | "in_minutes"
                                      | "hhmm";
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                        dto.web_home_widget.WebHomeWidgetType
                                          .NextTrain
                                      ) {
                                        return candidate;
                                      }
                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          time_format: next,
                                        },
                                      };
                                    });
                                  }}
                                >
                                  <option value="in_minutes">あとn分</option>
                                  <option value="hhmm">hh:mm</option>
                                </select>
                              </label>
                            </div>

                            {(() => {
                              const allIds = Object.values(
                                knowledge.train_timetable.TrainTimetableID,
                              );

                              const toggle = (
                                current: knowledge.train_timetable.TrainTimetableID[],
                                id: knowledge.train_timetable.TrainTimetableID,
                                checked: boolean,
                              ) => {
                                const set = new Set(current);
                                if (checked) {
                                  set.add(id);
                                } else {
                                  set.delete(id);
                                }
                                return Array.from(set);
                              };

                              const renderChecklist = (
                                title: string,
                                selected: knowledge.train_timetable.TrainTimetableID[],
                                onChange: (
                                  next: knowledge.train_timetable.TrainTimetableID[],
                                ) => void,
                              ) => (
                                <section className="form-section">
                                  <h4>{title}</h4>
                                  {selected.length > 0 && (
                                    <ul className="list-editor">
                                      {selected.map((id, index) => {
                                        const meta =
                                          knowledge.train_timetable
                                            .TrainTimetables[id];
                                        return (
                                          <li
                                            key={`selected-${id}`}
                                            className="list-editor__item"
                                          >
                                            <div className="list-editor__row list-editor__row--title-controls">
                                              <div className="list-editor__title-controls">
                                                <strong>{index + 1}.</strong>
                                                <span>
                                                  {meta.line} {meta.station} →{" "}
                                                  {meta.direction}方面
                                                </span>
                                              </div>
                                              <div className="inline-controls compact">
                                                <button
                                                  type="button"
                                                  className="button ghost"
                                                  onClick={() => {
                                                    if (index <= 0) {
                                                      return;
                                                    }
                                                    onChange(
                                                      moveIndex(
                                                        selected,
                                                        index,
                                                        index - 1,
                                                      ),
                                                    );
                                                  }}
                                                  disabled={index === 0}
                                                >
                                                  ↑
                                                </button>
                                                <button
                                                  type="button"
                                                  className="button ghost"
                                                  onClick={() => {
                                                    if (
                                                      index >=
                                                      selected.length - 1
                                                    ) {
                                                      return;
                                                    }
                                                    onChange(
                                                      moveIndex(
                                                        selected,
                                                        index,
                                                        index + 1,
                                                      ),
                                                    );
                                                  }}
                                                  disabled={
                                                    index ===
                                                    selected.length - 1
                                                  }
                                                >
                                                  ↓
                                                </button>
                                                <button
                                                  type="button"
                                                  className="button ghost danger"
                                                  onClick={() => {
                                                    onChange(
                                                      selected.filter(
                                                        (_, i) => i !== index,
                                                      ),
                                                    );
                                                  }}
                                                >
                                                  -
                                                </button>
                                              </div>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                  <div className="inline-check-grid">
                                    {allIds.map((id) => {
                                      const meta =
                                        knowledge.train_timetable
                                          .TrainTimetables[id];
                                      const isChecked = selected.includes(id);
                                      return (
                                        <label
                                          key={id}
                                          className="form-check inline"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(event) => {
                                              onChange(
                                                toggle(
                                                  selected,
                                                  id,
                                                  event.target.checked,
                                                ),
                                              );
                                            }}
                                          />
                                          {meta.line} {meta.station} →{" "}
                                          {meta.direction}方面
                                        </label>
                                      );
                                    })}
                                  </div>
                                </section>
                              );

                              if (widget.param.mode === "always") {
                                return renderChecklist(
                                  "表示する時刻表",
                                  widget.param.timetable_ids,
                                  (next) => {
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                          dto.web_home_widget.WebHomeWidgetType
                                            .NextTrain ||
                                        candidate.param.mode !== "always"
                                      ) {
                                        return candidate;
                                      }
                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          timetable_ids: next,
                                        },
                                      };
                                    });
                                  },
                                );
                              }

                              return (
                                <>
                                  {renderChecklist(
                                    "切替前(午前)の時刻表",
                                    widget.param.before_ids,
                                    (next) => {
                                      updateWidget(widgetIndex, (candidate) => {
                                        if (
                                          candidate.type !==
                                            dto.web_home_widget
                                              .WebHomeWidgetType.NextTrain ||
                                          candidate.param.mode !== "switch"
                                        ) {
                                          return candidate;
                                        }
                                        return {
                                          ...candidate,
                                          param: {
                                            ...candidate.param,
                                            before_ids: next,
                                          },
                                        };
                                      });
                                    },
                                  )}
                                  {renderChecklist(
                                    "切替後(午後)の時刻表",
                                    widget.param.after_ids,
                                    (next) => {
                                      updateWidget(widgetIndex, (candidate) => {
                                        if (
                                          candidate.type !==
                                            dto.web_home_widget
                                              .WebHomeWidgetType.NextTrain ||
                                          candidate.param.mode !== "switch"
                                        ) {
                                          return candidate;
                                        }
                                        return {
                                          ...candidate,
                                          param: {
                                            ...candidate.param,
                                            after_ids: next,
                                          },
                                        };
                                      });
                                    },
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {(widget.type ===
                          dto.web_home_widget.WebHomeWidgetType
                            .PersonalTimetable ||
                          widget.type ===
                            dto.web_home_widget.WebHomeWidgetType
                              .HomeClassOriginalTimetable) && (
                          <div className="settings-form">
                            <div className="form-row">
                              <label className="form-field">
                                <FormFieldLabel required>
                                  表示形式
                                </FormFieldLabel>
                                <select
                                  value={widget.param.format}
                                  onChange={(event) => {
                                    const nextFormat = event.target
                                      .value as dto.web_home_widget.WebHomeWidgetParamPersonalTimetable["format"];

                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                          dto.web_home_widget.WebHomeWidgetType
                                            .PersonalTimetable &&
                                        candidate.type !==
                                          dto.web_home_widget.WebHomeWidgetType
                                            .HomeClassOriginalTimetable
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          format: nextFormat,
                                        },
                                      };
                                    });
                                  }}
                                >
                                  <option value="grid">表形式</option>
                                  <option value="list">リスト</option>
                                </select>
                              </label>
                            </div>

                            <div className="inline-check-grid">
                              <label className="form-check inline">
                                <input
                                  type="checkbox"
                                  checked={widget.param.today_only}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                          dto.web_home_widget.WebHomeWidgetType
                                            .PersonalTimetable &&
                                        candidate.type !==
                                          dto.web_home_widget.WebHomeWidgetType
                                            .HomeClassOriginalTimetable
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          today_only: checked,
                                        },
                                      };
                                    });
                                  }}
                                />
                                今日のみ
                              </label>

                              <label className="form-check inline">
                                <input
                                  type="checkbox"
                                  checked={widget.param.today_first}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    updateWidget(widgetIndex, (candidate) => {
                                      if (
                                        candidate.type !==
                                          dto.web_home_widget.WebHomeWidgetType
                                            .PersonalTimetable &&
                                        candidate.type !==
                                          dto.web_home_widget.WebHomeWidgetType
                                            .HomeClassOriginalTimetable
                                      ) {
                                        return candidate;
                                      }

                                      return {
                                        ...candidate,
                                        param: {
                                          ...candidate.param,
                                          today_first: checked,
                                        },
                                      };
                                    });
                                  }}
                                />
                                今日始まり
                              </label>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      <SaveDiscardBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={() => {
          void saveWebSettings();
        }}
        onCancel={() => {
          if (reloadOnSave) {
            window.location.reload();
            return;
          }
          void loadPage();
        }}
      />

      {saveErrorDialog && (
        <ErrorDialog
          title="保存に失敗しました"
          message={saveErrorDialog}
          onClose={() => {
            setSaveErrorDialog(null);
          }}
        />
      )}
    </>
  );
}

export default function WebSettingsPage() {
  return (
    <AppShell
      title="ホーム画面の表示"
      description="テーマやウィジェットの並び順を変更できます。"
    >
      <WebSettingsView />
    </AppShell>
  );
}
